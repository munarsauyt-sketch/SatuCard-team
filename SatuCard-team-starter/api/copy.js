import { configuration } from '../lib/supabase.js';
import { readAccount, accountFailure, accountJson } from '../lib/account.js';
import { validateInput, generateCopy, COPY_MODEL, MAX_REQUEST_BYTES } from '../lib/copy.js';
import { reserveCopyQuota } from '../lib/copy-quota.js';
import { AI_ACCESS_MESSAGE, hasAiAccess, isAiAdmin } from '../lib/ai-access.js';

// Paid generation is closed by default. Only explicitly trusted account UUIDs
// may use it; self-service signup is not permission to spend the owner's key.
function allowedUsers() {
  return new Set((process.env.OPENAI_COPY_ALLOWED_USER_IDS || '').split(',').map(id => id.trim().toLowerCase())
    .filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)));
}
function enabled() {
  return process.env.OPENAI_COPY_ENABLED === 'true' && (!process.env.OPENAI_COPY_MODEL?.trim() || process.env.OPENAI_COPY_MODEL.trim() === COPY_MODEL);
}
export async function GET(request) {
  const config = configuration();
  const available = Boolean(enabled() && config && process.env.OPENAI_API_KEY?.trim() && allowedUsers().size);
  return accountJson({ available, hasAccess: await hasAiAccess(request, config), adminOnly: true });
}
export async function POST(request) {
  const config = configuration();
  if (!config || !enabled()) return accountJson({ error: 'ИИ-помощник пока не настроен.', code: 'ai_unavailable' }, 503);
  let user;
  try { ({ user } = await readAccount(request, config, { complete: true })); }
  catch (error) { return accountFailure(error); }
  if (!isAiAdmin(user)) return accountJson({ error: AI_ACCESS_MESSAGE, code: 'ai_subscription_required' }, 403);
  const key = process.env.OPENAI_API_KEY?.trim();
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
  } catch { return accountJson({ error: 'Проверьте название, факты, язык и тон.', code: 'invalid_input' }, 400); }
  let allowed;
  try { allowed = await reserveCopyQuota(config, user.id); }
  catch { return accountJson({ error: 'Общий лимит ИИ недоступен. Используйте локальный шаблон.', code: 'ai_quota_unavailable' }, 503); }
  if (!allowed) return accountJson({ error: 'Лимит ИИ-запросов достигнут. Подождите не менее минуты или используйте локальный шаблон.', code: 'ai_rate_limited' }, 429);
  try {
    return accountJson(await generateCopy(input, { key }));
  } catch {
    return accountJson({ error: 'Не удалось получить корректный черновик ИИ. Попытка учтена в лимите. Используйте шаблон или повторите позже.', code: 'ai_failed' }, 502);
  }
}
