import { configuration } from '../lib/supabase.js';
import { readAccount, AccountError, accountFailure, accountJson } from '../lib/account.js';
import { readBoundedBody } from '../lib/request-body.js';
import { isAiAdmin } from '../lib/ai-access.js';
import { availableAiModels } from '../lib/ai-models.js';
import { billingId, billingPlan, billingRpc, paidAccessEnabled, paymentRequestsEnabled, publicOrder, publicGrant, publicPlans, paymentDetails } from '../lib/billing.js';

async function account(request) {
  const config = configuration();
  if (!config) throw new AccountError('Сервис аккаунтов пока не настроен.', 503, 'billing_unavailable');
  const { user } = await readAccount(request, config, { complete: true });
  return { config, user, isAdmin: isAiAdmin(user) };
}

export async function GET(request) {
  try {
    const { config, user, isAdmin } = await account(request);
    if (!paidAccessEnabled()) return accountJson({
      ready: false, ordering: false, isAdmin, active: null, scheduled: [], orders: [],
      models: availableAiModels({ isAdmin }), plans: publicPlans(), payment: paymentDetails(),
      message: 'Платные тарифы готовятся к запуску.'
    });
    if (new URL(request.url).searchParams.get('admin') === '1') {
      if (!isAdmin) throw new AccountError('Требуется доступ администратора.', 403, 'admin_required');
      const data = await billingRpc(config, 'get_billing_admin_queue', {});
      if (!Array.isArray(data.orders)) throw new Error('Invalid billing queue');
      return accountJson({ orders: data.orders.map(publicOrder) });
    }
    let data;
    try { data = await billingRpc(config, 'get_billing_status', { p_user_id: user.id }); }
    catch (error) {
      if (error.code !== 'billing_unavailable') throw error;
      return accountJson({ ready: false, ordering: false, isAdmin, active: null, scheduled: [], orders: [],
        models: availableAiModels({ isAdmin }), plans: publicPlans(), payment: paymentDetails(), message: error.message });
    }
    if (!Array.isArray(data.orders) || !Array.isArray(data.scheduled)) throw new Error('Invalid billing status');
    return accountJson({ ready: true, ordering: paymentRequestsEnabled(), isAdmin, active: publicGrant(data.active), scheduled: data.scheduled.map(publicGrant),
      orders: data.orders.map(publicOrder), models: availableAiModels({ isAdmin, active: data.active }),
      plans: publicPlans(), payment: paymentDetails() });
  } catch (error) { return accountFailure(error); }
}

export async function POST(request) {
  try {
    const { config, user, isAdmin } = await account(request);
    if (!paidAccessEnabled()) throw new AccountError('Платные тарифы пока недоступны.', 503, 'billing_unavailable');
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw new AccountError('Ожидается JSON.', 415, 'invalid_input');
    let body;
    try { body = JSON.parse((await readBoundedBody(request, 4096)).toString('utf8')); }
    catch (error) { if (error instanceof AccountError) throw error; throw new AccountError('Неверные данные заявки.', 400, 'invalid_input'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AccountError('Неверные данные заявки.', 400, 'invalid_input');
    let data;
    if (body.action === 'create') {
      if (!paymentRequestsEnabled()) throw new AccountError('Новые заявки на оплату пока закрыты.', 503, 'checkout_unavailable');
      if (!billingPlan(body.planId) || !billingId(body.requestId)) throw new AccountError('Выберите тариф и повторите оформление.', 400, 'invalid_input');
      data = await billingRpc(config, 'create_billing_order', { p_user_id: user.id, p_plan_id: body.planId, p_request_id: body.requestId });
    } else {
      if (!billingId(body.orderId)) throw new AccountError('Неверный номер заявки.', 400, 'invalid_input');
      if (body.action === 'cancel') {
        data = await billingRpc(config, 'cancel_billing_order', { p_user_id: user.id, p_order_id: body.orderId });
      } else {
        if (!isAdmin) throw new AccountError('Требуется доступ администратора.', 403, 'admin_required');
        if (body.action === 'confirm') {
          const ref = typeof body.paymentReference === 'string' ? body.paymentReference.trim() : '';
          if (!ref || ref.length > 128 || !Number.isSafeInteger(body.receivedAmountKzt) || body.receivedAmountKzt < 1 || body.receiptChecked !== true) {
            throw new AccountError('Подтвердите проверку поступления, укажите сумму и номер банковской операции.', 400, 'invalid_input');
          }
          data = await billingRpc(config, 'confirm_billing_order', { p_order_id: body.orderId, p_admin_user_id: user.id, p_payment_ref: ref, p_received_amount: body.receivedAmountKzt });
        } else if (body.action === 'reject') {
          const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
          if (!reason || reason.length > 240) throw new AccountError('Укажите причину отклонения.', 400, 'invalid_input');
          data = await billingRpc(config, 'reject_billing_order', { p_order_id: body.orderId, p_admin_user_id: user.id, p_reason: reason });
        } else throw new AccountError('Неизвестное действие.', 400, 'invalid_input');
      }
    }
    if (!data.order || !billingId(data.order.id)) throw new Error('Invalid billing order');
    const order = publicOrder(data.order);
    return accountJson({ order, payment: paymentDetails() }, body.action === 'create' ? 201 : 200);
  } catch (error) { return accountFailure(error); }
}
