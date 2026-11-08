import { configuration } from '../lib/supabase.js';
import { readAccount, accountFailure, accountJson } from '../lib/account.js';
import { validateInput, generateCopy } from '../lib/copy.js';

// Paid generation is closed by default. Only explicitly trusted account UUIDs
// may use it; self-service signup is not permission to spend the owner's key.
function allowedUsers() {
  return new Set((process.env.OPENAI_COPY_ALLOWED_USER_IDS || '').split(',').map(id => id.trim().toLowerCase())
    .filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)));
}
// Best-effort warm-instance protection, NOT a distributed billing cap. Cold
// starts and parallel instances reset/partition this state. Configure a provider
// project budget/quota; use a durable atomic limiter before opening access wider.
const usage = new Map();
function reserve(userId) {
  const now = Date.now(), day = Math.floor(now / 86400000);
  for (const [id, entry] of usage) if (entry.day !== day && !entry.busy) usage.delete(id);
  const entry = usage.get(userId) || { day, calls: 0, last: 0, busy: false };
  if (entry.busy || (entry.calls && now - entry.last < 10000) || (entry.day === day && entry.calls >= 20)) return null;
  if (entry.day !== day) { entry.day = day; entry.calls = 0; }
  entry.calls++; entry.last = now; entry.busy = true; usage.set(userId, entry);
  return () => { entry.busy = false; };
}
export function GET() {
  return accountJson({ available: Boolean(configuration() && process.env.OPENAI_API_KEY?.trim() && allowedUsers().size) });
}
export async function POST(request) {
  const config = configuration();
  if (!config) return accountJson({ error: 'ИИ-помощник пока не настроен.', code: 'ai_unavailable' }, 503);
  let user;
  try { ({ user } = await readAccount(request, config, { complete: true })); }
  catch (error) { return accountFailure(error); }
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return accountJson({ error: 'ИИ-помощник пока не настроен. Можно использовать локальный шаблон.', code: 'ai_unavailable' }, 503);
  if (!allowedUsers().has(user.id.toLowerCase())) return accountJson({ error: 'ИИ доступен только аккаунтам, подключённым владельцем сайта. Используйте локальный шаблон.', code: 'ai_access_required' }, 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return accountJson({ error: 'Ожидается JSON.', code: 'invalid_input' }, 415);
  let input;
  try {
    // Bound streamed bytes too; Content-Length alone is not trustworthy.
    if (Number(request.headers.get('content-length')) > 16000) throw new Error('Too large');
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing body');
    const parts = []; let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.length;
        if (length > 16000) { await reader.cancel(); throw new Error('Too large'); }
        parts.push(value);
      }
    } finally { reader.releaseLock(); }
    input = validateInput(JSON.parse(Buffer.concat(parts).toString('utf8')));
  } catch { return accountJson({ error: 'Проверьте название, факты, язык и тон.', code: 'invalid_input' }, 400); }
  const release = reserve(user.id);
  if (!release) return accountJson({ error: 'Лимит ИИ-запросов достигнут. Подождите или используйте локальный шаблон.', code: 'ai_rate_limited' }, 429);
  try {
    return accountJson(await generateCopy(input, { key, model: process.env.OPENAI_COPY_MODEL?.trim() || 'gpt-4.1-mini' }));
  } catch {
    return accountJson({ error: 'Не удалось получить корректный черновик ИИ. Попробуйте ещё раз или выберите локальный шаблон.', code: 'ai_failed' }, 502);
  } finally { release(); }
}
