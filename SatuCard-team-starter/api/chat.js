import { geminiSelected, geminiEnabled, geminiUsers } from '../lib/gemini.js';
import { configuration } from '../lib/supabase.js';
import { readAccount, accountFailure, accountJson } from '../lib/account.js';
import { validateChatInput as validateInput, generateChat as generateCopy, MAX_CHAT_REQUEST_BYTES as MAX_REQUEST_BYTES } from '../lib/chat.js';
import { COPY_MODEL } from '../lib/copy.js';
import { reserveCopyQuota } from '../lib/copy-quota.js';

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
  return accountJson({ available: Boolean(enabled() && configuration() && apiKey() && allowedUsers().size), modelVerified: false, ...(geminiSelected() ? { provider: 'gemini', model: 'gemini-2.5-flash' } : {}) });
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
  let allowed;
  try { allowed = await reserveCopyQuota(config, user.id); }
  catch { return accountJson({ error: 'Общий лимит ИИ недоступен. Используйте локальный шаблон.', code: 'ai_quota_unavailable' }, 503); }
  if (!allowed) return accountJson({ error: 'Лимит ИИ-запросов достигнут. Подождите не менее минуты или используйте локальный шаблон.', code: 'ai_rate_limited' }, 429);
  try {
    return accountJson(await generateCopy(input, { key, provider: geminiSelected() ? 'gemini' : 'openai' }));
  } catch (error) {
    if (geminiSelected()) {
      const known = ['Invalid response', 'Incomplete response', 'Invalid response', 'Invalid draft', 'Invalid text', 'Unsupported numeric claim', 'Unsafe reply', 'Unsafe proposal', 'Invalid features', 'Provider timeout'];
      console.warn('Gemini request failed', { status: Number.isInteger(error.providerStatus) ? error.providerStatus : null, reason: known.includes(error.message) ? error.message : 'provider_or_output_error' });
      if (error.providerStatus === 429) return accountJson({ error: 'Бесплатный лимит Google Gemini сейчас недоступен или исчерпан. Попробуйте позже. Платный тариф автоматически не включается.', code: 'gemini_quota' }, 429);
      if ([401, 403].includes(error.providerStatus)) return accountJson({ error: 'Google не принял серверный ключ Gemini или доступ проекта. Владелец сайта должен проверить настройки Google.', code: 'gemini_access' }, 503);
    }
    return accountJson({ error: 'Не удалось получить корректный ответ ИИ. Попытка учтена в лимите. Используйте шаблон или повторите позже.', code: 'ai_failed' }, 502);
  }
}
