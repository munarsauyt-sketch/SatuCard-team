import { AccountError } from './account.js';
import { ACCESS_DAYS, BILLING_PLANS } from '../billing-plans.js';
import { SUPPORT } from '../support.js';

export const billingId = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export const paidAccessEnabled = () => process.env.SAI_PAID_ACCESS_ENABLED === 'true';
export const paymentRequestsEnabled = () => paidAccessEnabled() && process.env.SAI_PAYMENT_REQUESTS_ENABLED === 'true';
const missingStorage = new Set(['42P01', '42883', 'PGRST202', 'PGRST205']);

export async function billingRpc(config, name, args) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const headers = { apikey: config.key, 'content-type': 'application/json' };
    if (!config.key.startsWith('sb_')) headers.Authorization = `Bearer ${config.key}`;
    const response = await fetch(`${config.base}/rest/v1/rpc/${name}`, {
      method: 'POST', headers, body: JSON.stringify(args), signal: controller.signal, cache: 'no-store'
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (missingStorage.has(data?.code)) throw new AccountError('Хранилище покупок ещё не подключено. Обратитесь в поддержку.', 503, 'billing_unavailable');
      if (data?.code === 'P0002') throw new AccountError('Заявка не найдена.', 404, 'order_not_found');
      if (data?.code === '23505') throw new AccountError('Эта операция уже зарегистрирована. Обновите список заявок.', 409, 'payment_conflict');
      if (data?.code === '22023') throw new AccountError('Проверьте заявку, сумму и подтверждение поступления.', 400, 'invalid_billing_request');
      throw new Error('Billing service unavailable');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid billing response');
    return data;
  } catch (error) {
    if (error instanceof AccountError) throw error;
    throw new AccountError('Сервис тарифов временно недоступен. Попробуйте позже.', 503, 'billing_unavailable');
  } finally { clearTimeout(timeout); }
}

export function billingPlan(id) { return BILLING_PLANS.find(plan => plan.id === id); }

export function publicOrder(row) {
  const plan = billingPlan(row.plan_id);
  return { id: row.id, planId: row.plan_id, planName: plan?.name || row.plan_id,
    amountKzt: row.amount_kzt, status: row.status, createdAt: row.created_at,
    confirmedAt: row.confirmed_at || null, reviewNote: row.rejection_reason || null,
    ...(typeof row.email === 'string' ? { email: row.email } : {}) };
}

export function publicGrant(row) {
  if (!row) return null;
  const used = Number(row.tokens_used), reserved = Number(row.tokens_reserved), limit = Number(row.token_limit);
  if (![used, reserved, limit].every(Number.isSafeInteger) || limit < 1 || used < 0 || reserved < 0 || used + reserved > limit) {
    throw new AccountError('Не удалось проверить остаток лимита.', 503, 'billing_unavailable');
  }
  return { planId: row.plan_id, planName: billingPlan(row.plan_id)?.name || row.plan_id,
    startsAt: row.starts_at, expiresAt: row.expires_at,
    usedPercent: Math.min(100, Math.ceil(used * 100 / limit)),
    reservedPercent: Math.min(100, Math.ceil(reserved * 100 / limit)),
    remainingPercent: Math.max(0, Math.floor((limit - used - reserved) * 100 / limit)),
    exhausted: used + reserved >= limit };
}

export function paymentDetails() {
  // Only an explicitly configured bank-hosted URL may become a payment target.
  // Card details are entered on the bank/processor page and never reach this app.
  let checkoutUrl = null;
  try {
    const url = new URL(process.env.PAYMENT_CHECKOUT_URL || '');
    if (url.protocol === 'https:' && !url.username && !url.password && !url.hash) checkoutUrl = url.href;
  } catch {}
  return { checkoutUrl: paymentRequestsEnabled() ? checkoutUrl : null, support: SUPPORT };
}

export const publicPlans = () => BILLING_PLANS.map(({ id, name, priceKzt, models, includes, benefits }) =>
  ({ id, name, priceKzt, models, includes, benefits, days: ACCESS_DAYS }));

export const quotaFailures = {
  access_expired: [403, 'Срок платного доступа закончился. Выберите новый период.'],
  model_unavailable: [403, 'Эта модель недоступна. Выберите другую модель.'],
  plan_required: [403, 'Для этой модели нужен другой тариф.'],
  paid_quota_exceeded: [429, 'Лимит тарифа исчерпан. Остаток и срок периода доступны в кабинете.'],
  ai_busy: [429, 'Уже выполняются запросы. Дождитесь их завершения.'],
  ai_cooldown: [429, 'Подождите пару секунд перед следующим запросом.'],
  provider_daily_limit: [429, 'Дневной бюджет сервиса исчерпан. Обратитесь в поддержку.'],
  duplicate_request: [409, 'Этот запрос уже был принят. Обновите состояние чата.']
};
