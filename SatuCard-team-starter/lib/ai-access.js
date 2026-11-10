import { readAccount } from './account.js';
import { billingPlan, billingRpc, paidAccessEnabled, publicGrant } from './billing.js';

// This server-owned UUID identifies the administrator. Profile names and client
// subscription flags never grant access to a provider key.
export function isAiAdmin(user) {
  const adminId = process.env.GEMINI_ADMIN_USER_ID?.trim().toLowerCase();
  return Boolean(adminId && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(adminId) &&
    typeof user?.id === 'string' && user.id.toLowerCase() === adminId);
}

export async function hasAiAccess(request, config) {
  if (!config || !request?.headers.get('authorization')) return false;
  try {
    const { user } = await readAccount(request, config, { complete: true });
    return isAiAdmin(user);
  } catch { return false; }
}

export async function accountAiAccess(config, user) {
  if (isAiAdmin(user)) return { isAdmin: true, hasAccess: true, ready: true, active: null };
  if (!paidAccessEnabled()) return { isAdmin: false, hasAccess: false, ready: true, active: null };
  try {
    const data = await billingRpc(config, 'get_billing_status', { p_user_id: user.id });
    if (!Array.isArray(data.orders) || !Array.isArray(data.scheduled)) throw new Error('Invalid billing status');
    const active = data.active;
    if (!active) return { isAdmin: false, hasAccess: false, ready: true, active: null };
    const starts = Date.parse(active.starts_at), expires = Date.parse(active.expires_at);
    const now = Date.now();
    if (active.user_id !== user.id || !billingPlan(active.plan_id) || !Number.isInteger(active.tier) ||
        active.tier < 1 || active.tier > 3 || !Number.isFinite(starts) || !Number.isFinite(expires) ||
        starts > now || expires <= now || active.revoked_at) {
      throw new Error('Invalid active grant');
    }
    publicGrant(active);
    return { isAdmin: false, hasAccess: true, ready: true, active };
  } catch {
    return { isAdmin: false, hasAccess: false, ready: false, active: null };
  }
}

export const AI_ACCESS_MESSAGE = 'Для ИИ нужен активный тариф. Выберите тариф в личном кабинете.';
