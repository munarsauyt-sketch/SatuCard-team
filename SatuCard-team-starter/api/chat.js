import { geminiSelected, geminiEnabled, geminiUsers, geminiModel } from '../lib/gemini.js';
import { availableEvaluations, availableFallbacks, configuredEvaluation, configuredFallback, configuredSol } from '../lib/chat-providers.js';
import { configuration } from '../lib/supabase.js';
import { readAccount, accountFailure, accountJson } from '../lib/account.js';
import { validateChatInput as validateInput, generateChat as generateCopy, MAX_CHAT_REQUEST_BYTES as MAX_REQUEST_BYTES } from '../lib/chat.js';
import { COPY_MODEL } from '../lib/copy.js';
import { reserveCopyQuota } from '../lib/copy-quota.js';
import { AI_ACCESS_MESSAGE, accountAiAccess, isAiAdmin } from '../lib/ai-access.js';
import { availableAiModels, defaultAiModel } from '../lib/ai-models.js';
import { generatePaidChat } from '../lib/paid-chat.js';
import { paidAccessEnabled } from '../lib/billing.js';
import { ANYMODEL_MODEL } from '../lib/anymodel.js';
import { FREE_CHAT_CATALOG, FREE_CHAT_DEFAULT_MODEL, configuredFreeChat, freeChatModelLabel, isFreeChatModel } from '../lib/free-chat-models.js';

const FREE_WINDOW_MS = 60000;
const FREE_LIMIT_PER_IP = 8;
const MAX_FREE_REQUEST_BYTES = 32000;
const freeRateHits = new Map();

function allowFreeIp(request) {
  const raw = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'local';
  const ip = raw.split(',')[0].trim().slice(0, 64) || 'local';
  const now = Date.now();
  if (freeRateHits.size > 500) {
    for (const [key, times] of freeRateHits) {
      const fresh = times.filter(t => now - t < FREE_WINDOW_MS);
      if (fresh.length) freeRateHits.set(key, fresh);
      else freeRateHits.delete(key);
    }
  }
  const recent = (freeRateHits.get(ip) || []).filter(t => now - t < FREE_WINDOW_MS);
  if (recent.length >= FREE_LIMIT_PER_IP) return false;
  recent.push(now);
  freeRateHits.set(ip, recent);
  return true;
}

async function readBoundedJson(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) throw new Error('Too large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const parts = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) { await reader.cancel(); throw new Error('Too large'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

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
  const legacyAvailable = Boolean(enabled() && config && apiKey() && userCount);
  const paidEnabled = paidAccessEnabled();
  const anymodel = configuredSol();
  const freeChat = configuredFreeChat();
  let access = { isAdmin: false, hasAccess: false, ready: false, active: null };
  if (config && request?.headers.get('authorization')) {
    try {
      const { user } = await readAccount(request, config, { complete: true });
      access = await accountAiAccess(config, user);
      if (access.isAdmin && !users.has(user.id.toLowerCase())) access.hasAccess = false;
    } catch {}
  }
  const { hasAccess } = access;
  const paidCustomer = paidEnabled && hasAccess && !access.isAdmin;
  const baseAvailable = paidCustomer ? Boolean(anymodel) : legacyAvailable;
  const fallbackProviders = !paidCustomer && baseAvailable && geminiSelected() ? availableFallbacks() : [];
  const evaluationProviders = !paidCustomer && baseAvailable && geminiSelected() ? availableEvaluations() : [];
  const sol = !paidCustomer && baseAvailable && geminiSelected() && hasAccess ? anymodel : null;
  const paidModels = hasAccess && (paidCustomer ? anymodel : sol) ? availableAiModels(access) : [];
  const freeModels = freeChat ? FREE_CHAT_CATALOG : [];
  const freeOnly = Boolean(freeChat && (!hasAccess || !baseAvailable));
  const combinedModels = [...paidModels, ...freeModels];
  const defaultModel = paidModels.length
    ? defaultAiModel(access)
    : (freeModels[0] || null);
  const effectiveHasAccess = hasAccess || Boolean(freeChat);
  const available = baseAvailable || Boolean(freeChat);
  return accountJson({
    available,
    hasAccess: effectiveHasAccess,
    adminOnly: !paidEnabled && !freeChat,
    modelVerified: false,
    ...(freeChat ? { freeChatAvailable: true, ...(freeOnly ? { freeChat: true } : {}) } : {}),
    ...(effectiveHasAccess && (paidEnabled || sol || freeChat) ? {
      paidCustomer,
      models: combinedModels,
      defaultModel
    } : {}),
    ...(geminiSelected() && !freeOnly ? { provider: 'gemini', model: geminiModel(), singleUserPilot: baseAvailable && userCount === 1 } : {}),
    ...(fallbackProviders.length ? { fallbackProviders } : {}),
    ...(evaluationProviders.length ? { evaluationProviders } : {}),
    ...(sol ? { selectableProviders: [{ id: 'anymodel', label: sol.label }] } : {}),
    ...(fallbackProviders.some(item => item.id === 'groq') ? { groqFallbackAvailable: true } : {})
  });
}
export async function POST(request) {
  const config = configuration();
  const freeChat = configuredFreeChat();
  if (!freeChat && (!config || (!enabled() && !paidAccessEnabled()))) {
    return accountJson({ error: 'ИИ-помощник пока не настроен.', code: 'ai_unavailable' }, 503);
  }
  const evaluationId = new URL(request.url).searchParams.get('previewEvaluation');
  let user = null;
  let authError = null;
  let access = { isAdmin: false, hasAccess: false, ready: true, active: null };
  if (config && request.headers.get('authorization')) {
    try {
      ({ user } = await readAccount(request, config, { complete: true }));
      access = await accountAiAccess(config, user);
    } catch (error) {
      authError = error;
    }
  } else if (!freeChat) {
    try { ({ user } = await readAccount(request, config, { complete: true })); }
    catch (error) { return accountFailure(error); }
  }
  if (!freeChat) {
    if (authError) return accountFailure(authError);
    if (!access.hasAccess) return accountJson({
      error: access.ready ? AI_ACCESS_MESSAGE : 'Не удалось проверить платный доступ. Обратитесь в поддержку.',
      code: access.ready ? 'ai_subscription_required' : 'billing_unavailable'
    }, access.ready ? 403 : 503);
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return accountJson({ error: 'Ожидается JSON.', code: 'invalid_input' }, 415);
  if (evaluationId !== null && (!user || !access.isAdmin)) return accountJson({ error: 'Проверки провайдеров доступны администратору.', code: 'admin_required' }, 403);
  const evaluation = evaluationId !== null && geminiSelected() ? configuredEvaluation(evaluationId) : null;
  if (evaluationId !== null && !evaluation) return accountJson({ error: 'Этот тест недоступен в текущей сборке.', code: 'evaluation_unavailable' }, 404);
  let input;
  if (!evaluation) try {
    const byteLimit = user ? MAX_REQUEST_BYTES : MAX_FREE_REQUEST_BYTES;
    input = validateInput(await readBoundedJson(request, byteLimit));
  } catch { return accountJson({ error: 'Проверьте сообщение, историю, карточку, язык и согласие на фото.', code: 'invalid_input' }, 400); }

  const wantsFree = Boolean(freeChat && !evaluation && (
    input?.selectedProvider === 'sai_free' ||
    isFreeChatModel(input?.selectedModel) ||
    (!user || !access.hasAccess)
  ));

  if (wantsFree) {
    const requestedModel = input?.selectedModel || FREE_CHAT_DEFAULT_MODEL;
    if (!isFreeChatModel(requestedModel)) {
      return accountJson({ error: 'Для выбранной модели нужен активный тариф.', code: 'plan_required' }, 403);
    }
    if (input.imageDataUrl || input.fallbackProvider || input.groqFallbackConsent) {
      return accountJson({ error: 'Для этой модели отправьте текстовый запрос без фото и резерва.', code: 'invalid_input' }, 400);
    }
    if (!allowFreeIp(request)) {
      return accountJson({ error: 'Слишком много запросов к sAI. Подождите минуту и повторите.', code: 'ai_rate_limited' }, 429);
    }
    const label = freeChatModelLabel(requestedModel) || 'sAI';
    try {
      const result = await generateCopy(
        { ...input, history: input.history.slice(-4), selectedProvider: 'sai_free', selectedModel: requestedModel },
        { key: freeChat.key, provider: 'sai_free', providerModel: requestedModel, timeoutMs: 45000 }
      );
      return accountJson({ ...result, providerUsed: 'sai_free', modelUsed: requestedModel });
    } catch (error) {
      const status = logFailure('sai_free', error);
      if (status === 429) return accountJson({ error: `Модель ${label} сейчас перегружена. Подождите несколько секунд или выберите другую модель.`, code: 'ai_rate_limited' }, 429);
      if (status === 402) return accountJson({ error: `Модель ${label} сейчас недоступна. Выберите другую модель в списке.`, code: 'ai_model_unavailable' }, 503);
      if (error.message === 'Provider timeout') return accountJson({ error: `Модель ${label} не успела ответить. Попробуйте ещё раз или выберите другую модель.`, code: 'ai_timeout' }, 504);
      if (error.message === 'Unsupported numeric claim') return accountJson({ error: 'В ответе sAI появилось неподтверждённое число. Добавьте характеристики в «Проверенные факты о товаре» и повторите.', code: 'ai_failed' }, 502);
      return accountJson({ error: `Модель ${label} не вернула подходящий ответ. Попробуйте ещё раз или выберите другую модель.`, code: 'ai_failed' }, 502);
    }
  }

  if (authError) return accountFailure(authError);
  if (!user) return accountJson({ error: 'Войдите в аккаунт для выбранной модели.', code: 'auth_required' }, 401);
  if (!access.hasAccess) return accountJson({
    error: access.ready ? AI_ACCESS_MESSAGE : 'Не удалось проверить платный доступ. Обратитесь в поддержку.',
    code: access.ready ? 'ai_subscription_required' : 'billing_unavailable'
  }, access.ready ? 403 : 503);
  const key = apiKey();
  if (access.isAdmin && (!key || !enabled())) return accountJson({ error: 'ИИ-помощник пока не настроен. Можно использовать локальный шаблон.', code: 'ai_unavailable' }, 503);
  if (access.isAdmin && !allowedUsers().has(user.id.toLowerCase())) return accountJson({ error: 'ИИ доступен только аккаунтам, подключённым владельцем сайта. Используйте локальный шаблон.', code: 'ai_access_required' }, 403);
  const wantsSol = !access.isAdmin || input?.selectedProvider === 'anymodel';
  const sol = wantsSol && (!access.isAdmin || geminiSelected()) ? configuredSol() : null;
  if (wantsSol && !sol) return accountJson({ error: 'AnyModel пока не подключён в этой сборке.', code: 'sol_unavailable' }, 503);
  const models = wantsSol ? availableAiModels(access) : [];
  const modelId = input?.selectedModel || (access.isAdmin ? ANYMODEL_MODEL : defaultAiModel(access)?.id);
  const selectedModel = models.find(model => model.id === modelId);
  if (wantsSol && !selectedModel) return accountJson({ error: 'Для выбранной модели нужен другой тариф.', code: 'plan_required' }, 403);
  if (wantsSol && (input.imageDataUrl || input.fallbackProvider || input.groqFallbackConsent)) {
    return accountJson({ error: 'Для этой модели отправьте текстовый запрос без фото и резерва.', code: 'invalid_input' }, 400);
  }
  const isProduction = process.env.VERCEL_ENV === 'production';
  const isOwner = geminiSelected() && isAiAdmin(user);
  // Owner chat uses provider limits. Preview Sol and evaluations use the shared quota.
  const usesSiteQuota = access.isAdmin && (Boolean(evaluation) || !isOwner || Boolean(sol && !isProduction));
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
      const result = access.isAdmin
        ? await generateCopy({ ...input, history: input.history.slice(-4) }, { key: sol.key, provider: 'anymodel', providerModel: selectedModel.id, timeoutMs: 45000 })
        : await generatePaidChat(input, { config, user, model: selectedModel, key: sol.key });
      return accountJson({ ...result, providerUsed: 'anymodel', modelUsed: selectedModel.id });
    } catch (error) {
      if (error.status && error.code) return accountFailure(error);
      const status = logFailure('anymodel', error);
      const quotaNote = error.customerQuotaReleased ? ' Лимит тарифа не списан.' : '';
      if (status === 402) return accountJson({ error: 'AnyModel отклонил запрос из-за баланса или лимита ключа.' + quotaNote, code: 'sol_balance' }, 402);
      if (status === 429) return accountJson({ error: 'AnyModel ограничивает запросы. Попробуйте позже.' + quotaNote, code: 'sol_quota' }, 429);
      if (error.message === 'Provider timeout' && error.customerQuotaReleased) return accountJson({ error: `Модель ${selectedModel.label} не успела ответить. Лимит тарифа не списан.`, code: 'sol_timeout' }, 504);
      if (error.message === 'Provider timeout') return accountJson({ error: `Модель ${selectedModel.label} не успела ответить. Запрос мог учитываться в расходе токенов.`, code: 'sol_timeout' }, 504);
      return accountJson({ error: `Модель ${selectedModel.label} не вернула подходящий ответ. Попробуйте позже.` + quotaNote, code: 'sol_failed' }, 502);
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
