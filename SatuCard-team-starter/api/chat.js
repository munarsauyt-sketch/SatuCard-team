import { geminiSelected, geminiEnabled, geminiUsers, geminiModel } from '../lib/gemini.js';
import { groqFallbackKey } from '../lib/groq.js';
import { configuration } from '../lib/supabase.js';
import { readAccount, accountFailure, accountJson } from '../lib/account.js';
import { validateChatInput as validateInput, generateChat as generateCopy, MAX_CHAT_REQUEST_BYTES as MAX_REQUEST_BYTES } from '../lib/chat.js';
import { COPY_MODEL } from '../lib/copy.js';
import { reserveCopyQuota } from '../lib/copy-quota.js';

const GEMINI_TIMEOUT_MS = 60000;
const GROQ_TIMEOUT_MS = 12000;

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
export function GET() {
  const userCount = allowedUsers().size;
  const available = Boolean(enabled() && configuration() && apiKey() && userCount);
  const groqFallbackAvailable = available && geminiSelected() && Boolean(groqFallbackKey());
  return accountJson({ available, modelVerified: false,
    ...(geminiSelected() ? { provider: 'gemini', model: geminiModel(), singleUserPilot: available && userCount === 1 } : {}),
    ...(groqFallbackAvailable ? { groqFallbackAvailable: true } : {}) });
}
export async function POST(request) {
  const config = configuration();
  if (!config || !enabled()) return accountJson({ error: 'ИИ-помощник пока не настроен.', code: 'ai_unavailable' }, 503);
  let user;
  try { ({ user } = await readAccount(request, config, { complete: true })); }
  catch (error) { return accountFailure(error); }
  const key = apiKey();
  if (!key) return accountJson({ error: 'ИИ-помощник пока не настроен. Можно использовать локальный шаблон.', code: 'ai_unavailable' }, 503);
  if (!allowedUsers().has(user.id.toLowerCase())) return accountJson({ error: 'ИИ доступен только аккаунтам, подключённым владельцем сайта. Используйте локальный шаблон.', code: 'ai_access_required' }, 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return accountJson({ error: 'Ожидается JSON.', code: 'invalid_input' }, 415);
  let input;
  try {
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
  // Only the verified, allowlisted Gemini administrator skips SatuCard's quota.
  const adminId = process.env.GEMINI_ADMIN_USER_ID?.trim().toLowerCase();
  const isGeminiAdmin = geminiSelected() && user.id.toLowerCase() === adminId;
  if (!isGeminiAdmin) {
    let allowed;
    try { allowed = await reserveCopyQuota(config, user.id); }
    catch { return accountJson({ error: 'Общий лимит ИИ недоступен. Используйте локальный шаблон.', code: 'ai_quota_unavailable' }, 503); }
    if (!allowed) return accountJson({ error: 'Лимит ИИ-запросов достигнут. Подождите не менее минуты или используйте локальный шаблон.', code: 'ai_rate_limited' }, 429);
  }
  const primary = geminiSelected() ? 'gemini' : 'openai';
  const started = performance.now();
  try {
    return accountJson(await generateCopy(input, { key, provider: primary, timeoutMs: primary === 'gemini' ? GEMINI_TIMEOUT_MS : 25000 }));
  } catch (error) {
    if (primary === 'gemini') {
      const known = ['Invalid response', 'Incomplete response', 'Invalid draft', 'Invalid text', 'Unsupported numeric claim', 'Unsafe reply', 'Unsafe proposal', 'Invalid features', 'Provider timeout'];
      console.warn('Gemini request failed', { status: Number.isInteger(error.providerStatus) ? error.providerStatus : null, reason: known.includes(error.message) ? error.message : 'provider_or_output_error' });
      if (error.message === 'Provider timeout') return accountJson({ error: 'Google Gemini не ответил за минуту. Попробуйте позже; автоматических повторов нет.', code: 'gemini_timeout' }, 504);
      if (error.providerStatus === 429) {
        const fallbackKey = input.groqFallbackConsent === true && groqFallbackKey();
        const timeoutMs = Math.min(GROQ_TIMEOUT_MS, GEMINI_TIMEOUT_MS - (performance.now() - started));
        if (fallbackKey && timeoutMs > 0) {
          try {
            // The same quota reservation covers both calls. Groq receives text only.
            const { imageDataUrl, imageConsent, ...textInput } = input;
            const result = await generateCopy(textInput, { key: fallbackKey, provider: 'groq', timeoutMs });
            return accountJson({ ...result, providerUsed: 'groq' });
          } catch (fallbackError) {
            const status = Number.isInteger(fallbackError.providerStatus) ? fallbackError.providerStatus : null;
            console.warn('Groq fallback failed', { status, reason: known.includes(fallbackError.message) ? fallbackError.message : 'provider_or_output_error' });
            if (status === 429) return accountJson({ error: 'Лимиты Gemini и Groq сейчас исчерпаны. Попробуйте позже.', code: 'groq_quota' }, 429);
            const message = fallbackError.message === 'Unsupported numeric claim'
              ? 'В ответе Groq появилось неподтверждённое число. Проверьте факты о товаре и повторите запрос.'
              : 'Резервный Groq сейчас не смог подготовить ответ. Попробуйте позже.';
            return accountJson({ error: message, code: 'groq_failed' }, 502);
          }
        }
        return accountJson({ error: 'Бесплатный лимит Google Gemini сейчас недоступен или исчерпан. Попробуйте позже. Платный тариф автоматически не включается.', code: 'gemini_quota' }, 429);
      }
      if ([401, 403].includes(error.providerStatus)) return accountJson({ error: 'Google не принял серверный ключ Gemini или доступ проекта. Владелец сайта должен проверить настройки Google.', code: 'gemini_access' }, 503);
    }
    const errorMessage = error.message === 'Unsupported numeric claim'
      ? 'В ответе sAI появилось неподтверждённое число. Укажите нужные характеристики в «Проверенных фактах о товаре» или попросите вариант без них.'
      : 'Не удалось получить корректный ответ ИИ. Используйте шаблон или повторите позже.';
    return accountJson({ error: errorMessage + (isGeminiAdmin ? '' : ' Попытка учтена в лимите SatuCard.'), code: 'ai_failed' }, 502);
  }
}
