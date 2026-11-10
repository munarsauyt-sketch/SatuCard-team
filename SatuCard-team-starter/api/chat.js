import { geminiSelected, geminiEnabled, geminiUsers, geminiModel } from '../lib/gemini.js';
import { availableEvaluations, availableFallbacks, configuredEvaluation, configuredFallback, configuredSol } from '../lib/chat-providers.js';
import { configuration } from '../lib/supabase.js';
import { readAccount, accountFailure, accountJson } from '../lib/account.js';
import { validateChatInput as validateInput, generateChat as generateCopy, MAX_CHAT_REQUEST_BYTES as MAX_REQUEST_BYTES } from '../lib/chat.js';
import { COPY_MODEL } from '../lib/copy.js';
import { reserveCopyQuota } from '../lib/copy-quota.js';
import { AI_ACCESS_MESSAGE, hasAiAccess, isAiAdmin } from '../lib/ai-access.js';

const GEMINI_TIMEOUT_MS = 60000;
const RESERVE_TIMEOUT_MS = 12000;
const knownFailureReasons = new Set(['Invalid response', 'Incomplete response', 'Invalid draft', 'Invalid text', 'Unsupported numeric claim', 'Unsafe reply', 'Unsafe proposal', 'Invalid features', 'Provider timeout']);
const sampleEvaluation = {
  mode: 'build', message: 'Собери карточку для демонстрационной чашки.', history: [], language: 'ru', tone: 'neutral',
  card: { title: 'Демо-чашка', subtitle: '', description: '', features: [], template: 'studio' },
  facts: 'Материал: керамика. Цвет: белый. Объём: 200 мл.'
};

function logFailure(provider, error) {
  const status = Number.isInteger(error.providerStatus) ? error.providerStatus : null;
  console.warn('sAI provider request failed', { provider, status, reason: knownFailureReasons.has(error.message) ? error.message : 'provider_or_output_error' });
  return status;
}

function reserveFailure(provider, label, error) {
  const status = logFailure(provider, error);
  const code = provider === 'groq' ? 'groq' : 'fallback';
  if (status === 429) return accountJson({ error: `Резерв ${label} сейчас ограничивает запросы. Попробуйте позже.`, code: code + '_quota' }, 429);
  const message = error.message === 'Unsupported numeric claim'
    ? `В ответе ${label} появилось неподтверждённое число. Проверьте факты о товаре и повторите запрос.`
    : `Резерв ${label} сейчас не смог подготовить ответ. Попробуйте позже.`;
  return accountJson({ error: message, code: code + '_failed' }, 502);
}

// Paid generation is closed by default. Only explicitly trusted account UUIDs
// may use it; self-service signup is not permission to spend the owner's key.
function allowedUsers() {
  if (geminiSelected()) return geminiUsers();
  return new Set((process.env.OPENAI_COPY_ALLOWED_USER_IDS || '').split(',').map(id => id.trim().toLowerCase())
    .filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)));
}
function enabled() {
  if (geminiSelected()) return geminiEnabled();
  return process.env.OPENAI_COPY_ENABLED === 'true' && (!process.env.OPENAI_COPY_MODEL?.trim() || process.env.OPENAI_COPY_MODEL.trim() === COPY_MODEL);
}
function apiKey() { return (geminiSelected() ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY)?.trim(); }

export async function GET(request) {
  const config = configuration();
  const users = allowedUsers();
  const userCount = users.size;
  const available = Boolean(enabled() && config && apiKey() && userCount);
  const hasAccess = await hasAiAccess(request, config);
  const fallbackProviders = available && geminiSelected() ? availableFallbacks() : [];
  const evaluationProviders = available && geminiSelected() ? availableEvaluations() : [];
  let sol = available && geminiSelected() ? configuredSol() : null;
  if (!hasAccess) sol = null;
  return accountJson({ available, hasAccess, adminOnly: true, modelVerified: false,
    ...(geminiSelected() ? { provider: 'gemini', model: geminiModel(), singleUserPilot: available && userCount === 1 } : {}),
    ...(fallbackProviders.length ? { fallbackProviders } : {}),
    ...(evaluationProviders.length ? { evaluationProviders } : {}),
    ...(sol ? { selectableProviders: [{ id: 'anymodel', label: sol.label }] } : {}),
    ...(fallbackProviders.some(item => item.id === 'groq') ? { groqFallbackAvailable: true } : {}) });
}
export async function POST(request) {
  const config = configuration();
  if (!config || !enabled()) return accountJson({ error: 'ИИ-помощник пока не настроен.', code: 'ai_unavailable' }, 503);
  let user;
  try { ({ user } = await readAccount(request, config, { complete: true })); }
  catch (error) { return accountFailure(error); }
  if (!isAiAdmin(user)) return accountJson({ error: AI_ACCESS_MESSAGE, code: 'ai_subscription_required' }, 403);
  const key = apiKey();
  if (!key) return accountJson({ error: 'ИИ-помощник пока не настроен. Можно использовать локальный шаблон.', code: 'ai_unavailable' }, 503);
  if (!allowedUsers().has(user.id.toLowerCase())) return accountJson({ error: 'ИИ доступен только аккаунтам, подключённым владельцем сайта. Используйте локальный шаблон.', code: 'ai_access_required' }, 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return accountJson({ error: 'Ожидается JSON.', code: 'invalid_input' }, 415);
  const evaluationId = new URL(request.url).searchParams.get('previewEvaluation');
  const evaluation = evaluationId !== null && geminiSelected() ? configuredEvaluation(evaluationId) : null;
  if (evaluationId !== null && !evaluation) return accountJson({ error: 'Этот тест недоступен в текущей сборке.', code: 'evaluation_unavailable' }, 404);
  let input;
  if (!evaluation) try {
    // Bound streamed bytes too; Content-Length alone is not trustworthy.
    if (Number(request.headers.get('content-length')) > MAX_REQUEST_BYTES) throw new Error('Too large');
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing body');
    const parts = []; let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.length;
        if (length > MAX_REQUEST_BYTES) { await reader.cancel(); throw new Error('Too large'); }
        parts.push(value);
      }
    } finally { reader.releaseLock(); }
    input = validateInput(JSON.parse(Buffer.concat(parts).toString('utf8')));
  } catch { return accountJson({ error: 'Проверьте сообщение, историю, карточку, язык и согласие на фото.', code: 'invalid_input' }, 400); }
  const wantsSol = input?.selectedProvider === 'anymodel';
  const sol = wantsSol && geminiSelected() ? configuredSol() : null;
  if (wantsSol && !sol) return accountJson({ error: 'Sol сейчас недоступен. Выберите Gemini в чате.', code: 'sol_unavailable' }, 503);
  const isProduction = process.env.VERCEL_ENV === 'production';
  const isOwner = geminiSelected() && isAiAdmin(user);
  // Owner chat uses provider limits. Preview Sol and evaluations use the shared quota.
  const usesSiteQuota = Boolean(evaluation) || !isOwner || Boolean(sol && !isProduction);
  if (usesSiteQuota) {
    let allowed;
    try { allowed = await reserveCopyQuota(config, user.id); }
    catch { return accountJson({ error: 'Общий лимит ИИ недоступен. Используйте локальный шаблон.', code: 'ai_quota_unavailable' }, 503); }
    if (!allowed) return accountJson({ error: 'Лимит ИИ-запросов достигнут. Подождите не менее минуты или используйте локальный шаблон.', code: 'ai_rate_limited' }, 429);
  }
  if (evaluation) {
    const started = performance.now();
    try {
      const result = await generateCopy(sampleEvaluation, { key: evaluation.key, provider: evaluationId, timeoutMs: RESERVE_TIMEOUT_MS });
      return accountJson({ ...result, providerUsed: evaluationId, elapsedMs: Math.round(performance.now() - started) });
    } catch (error) {
      const status = logFailure(evaluationId, error);
      return accountJson({ error: `Тест ${evaluation.label} не прошёл. Проверьте ключ и доступную квоту.`, code: 'evaluation_failed' }, status === 429 ? 429 : 502);
    }
  }
  if (sol) {
    try {
      const result = await generateCopy({ ...input, history: input.history.slice(-4) }, { key: sol.key, provider: 'anymodel', timeoutMs: 45000 });
      return accountJson({ ...result, providerUsed: 'anymodel' });
    } catch (error) {
      const status = logFailure('anymodel', error);
      if (status === 402) return accountJson({ error: 'AnyModel отклонил запрос из-за баланса или лимита ключа.', code: 'sol_balance' }, 402);
      if (status === 429) return accountJson({ error: 'AnyModel ограничивает запросы. Попробуйте позже.', code: 'sol_quota' }, 429);
      if (error.message === 'Provider timeout') return accountJson({ error: 'Sol не успел ответить. Запрос мог учитываться в расходе токенов.', code: 'sol_timeout' }, 504);
      return accountJson({ error: 'Sol не вернул подходящий ответ. Проверьте доступ к модели и попробуйте позже.', code: 'sol_failed' }, 502);
    }
  }
  const primary = geminiSelected() ? 'gemini' : 'openai';
  const started = performance.now();
  try {
    return accountJson(await generateCopy(input, { key, provider: primary, timeoutMs: primary === 'gemini' ? GEMINI_TIMEOUT_MS : 25000 }));
  } catch (error) {
    if (primary === 'gemini') {
      logFailure('gemini', error);
      if (error.message === 'Provider timeout') return accountJson({ error: 'Google Gemini не ответил за минуту. Попробуйте позже; автоматических повторов нет.', code: 'gemini_timeout' }, 504);
      if (error.providerStatus === 429) {
        const provider = input.fallbackProvider || (input.groqFallbackConsent === true ? 'groq' : null);
        const reserve = provider && configuredFallback(provider);
        const timeoutMs = Math.min(RESERVE_TIMEOUT_MS, GEMINI_TIMEOUT_MS - (performance.now() - started));
        if (reserve && timeoutMs > 0) {
          try {
            // The same quota reservation covers both calls. The selected reserve receives text only.
            const { imageDataUrl, imageConsent, ...textInput } = input;
            const result = await generateCopy(textInput, { key: reserve.key, accountId: reserve.accountId, provider, timeoutMs });
            return accountJson({ ...result, providerUsed: provider });
          } catch (fallbackError) {
            return reserveFailure(provider, reserve.label, fallbackError);
          }
        }
        return accountJson({ error: 'Бесплатный лимит Google Gemini сейчас недоступен или исчерпан. Попробуйте позже. Платный тариф автоматически не включается.', code: 'gemini_quota' }, 429);
      }
      if ([401, 403].includes(error.providerStatus)) return accountJson({ error: 'Google не принял серверный ключ Gemini или доступ проекта. Владелец сайта должен проверить настройки Google.', code: 'gemini_access' }, 503);
    }
    const errorMessage = error.message === 'Unsupported numeric claim'
      ? 'В ответе sAI появилось неподтверждённое число. Укажите нужные характеристики в «Проверенных фактах о товаре» или попросите вариант без них.'
      : 'Не удалось получить корректный ответ ИИ. Используйте шаблон или повторите позже.';
    return accountJson({ error: errorMessage + (usesSiteQuota ? ' Попытка учтена в лимите SatuCard.' : ''), code: 'ai_failed' }, 502);
  }
}
