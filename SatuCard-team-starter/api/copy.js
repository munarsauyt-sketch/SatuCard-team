import { configuration } from '../lib/supabase.js';
import { readAccount, accountFailure, accountJson } from '../lib/account.js';
import { validateInput, generateCopy, COPY_MODEL, MAX_REQUEST_BYTES } from '../lib/copy.js';
import { reserveCopyQuota } from '../lib/copy-quota.js';
import { AI_ACCESS_MESSAGE, hasAiAccess, accountAiAccess } from '../lib/ai-access.js';
import { configuredSol } from '../lib/chat-providers.js';
import { defaultAiModel } from '../lib/ai-models.js';
import { paidAccessEnabled } from '../lib/billing.js';
import { generatePaidChat } from '../lib/paid-chat.js';

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
  if (paidAccessEnabled() && config && request?.headers.get('authorization')) {
    try {
      const { user } = await readAccount(request, config, { complete: true });
      const access = await accountAiAccess(config, user);
      if (!access.isAdmin) return accountJson({ available: Boolean(configuredSol()), hasAccess: access.hasAccess,
        adminOnly: false, paidCustomer: access.hasAccess, provider: 'anymodel', defaultModel: defaultAiModel(access) });
    } catch {}
  }
  const available = Boolean(enabled() && config && process.env.OPENAI_API_KEY?.trim() && allowedUsers().size);
  return accountJson({ available, hasAccess: await hasAiAccess(request, config), adminOnly: !paidAccessEnabled() });
}
export async function POST(request) {
  const config = configuration();
  if (!config || (!enabled() && !paidAccessEnabled())) return accountJson({ error: 'ИИ-помощник пока не настроен.', code: 'ai_unavailable' }, 503);
  let user;
  try { ({ user } = await readAccount(request, config, { complete: true })); }
  catch (error) { return accountFailure(error); }
  const access = await accountAiAccess(config, user);
  if (!access.hasAccess) return accountJson({ error: access.ready ? AI_ACCESS_MESSAGE : 'Не удалось проверить платный доступ.',
    code: access.ready ? 'ai_subscription_required' : 'billing_unavailable' }, access.ready ? 403 : 503);
  const key = process.env.OPENAI_API_KEY?.trim();
  if (access.isAdmin && (!enabled() || !key)) return accountJson({ error: 'ИИ-помощник пока не настроен. Можно использовать локальный шаблон.', code: 'ai_unavailable' }, 503);
  if (access.isAdmin && !allowedUsers().has(user.id.toLowerCase())) return accountJson({ error: 'ИИ доступен только аккаунтам, подключённым владельцем сайта. Используйте локальный шаблон.', code: 'ai_access_required' }, 403);
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
  if (!access.isAdmin) {
    const provider = configuredSol(), model = defaultAiModel(access);
    if (!provider || !model) return accountJson({ error: 'ИИ пока не подключён в этой сборке. Используйте локальный шаблон.', code: 'ai_unavailable' }, 503);
    if (input.imageDataUrl) return accountJson({ error: 'Для этого тарифа используйте текстовые факты без отправки фото.', code: 'invalid_input' }, 400);
    try {
      const result = await generatePaidChat({
        message: 'Подготовь краткий черновик карточки из подтверждённых данных.', mode: 'build', history: [],
        card: { title: input.title, subtitle: '', description: '', features: [], template: 'studio' },
        facts: input.facts, language: input.language, tone: input.tone
      }, { config, user, model, key: provider.key, requireProposal: true });
      return accountJson({ ...result.proposal, source: 'ai', providerUsed: 'anymodel', modelUsed: model.id });
    } catch (error) {
      if (error.status && error.code) return accountFailure(error);
      const quotaNote = error.customerQuotaReleased ? ' Лимит тарифа не списан.' : '';
      return accountJson({ error: 'Модель не подготовила корректный черновик. Попробуйте позже.' + quotaNote, code: 'ai_failed' }, 502);
    }
  }
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
