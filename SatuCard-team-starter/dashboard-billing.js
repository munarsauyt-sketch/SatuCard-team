import { SUPPORT } from './support.js';
import { TRANSFER_CARD_DISPLAY } from './payment-requisites.js';

const $ = id => document.getElementById(id);
const money = amount => new Intl.NumberFormat('ru-RU').format(amount) + ' ₸';
const date = value => new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Qyzylorda'
}).format(new Date(value));
const labels = { pending: 'На проверке', confirmed: 'Подтверждена', cancelled: 'Отменена', rejected: 'Отклонена' };
const status = $('billing-status');
let busy = false;
let pendingCreate = null;
let generation = 0;
let accountId;

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(text, href, className) {
  const node = element('a', text);
  node.href = href;
  if (className) node.className = className;
  return node;
}

function button(text, action) {
  const node = element('button', text);
  node.type = 'button';
  node.className = 'button button-light';
  node.addEventListener('click', action);
  return node;
}

async function request(path = '', body) {
  const session = await window.SATUCARD_AUTH?.getSession();
  if (!session?.access_token) throw new Error('Войдите, чтобы посмотреть тариф.');
  const response = await fetch('/api/billing' + path, {
    cache: 'no-store',
    headers: { Authorization: 'Bearer ' + session.access_token, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Сервис тарифов временно недоступен.');
  return data;
}

async function update(body, onSuccess) {
  if (busy) return;
  busy = true;
  try {
    await request('', body);
    onSuccess?.();
    await refresh();
  } catch (error) { status.textContent = error.message; }
  finally { busy = false; }
}

function adminActions(order) {
  const details = element('details');
  details.append(element('summary', 'Проверить поступление'));
  const form = element('form');
  form.className = 'billing-form';
  function field(label, type, limit) {
    const wrapper = element('label', label);
    const input = element('input');
    input.type = type;
    input.required = true;
    if (limit) input.maxLength = limit;
    wrapper.append(input);
    form.append(wrapper);
    return input;
  }
  const amount = field('Сумма поступления, ₸', 'number');
  amount.min = '1';
  const ref = field('Номер банковской операции', 'text', 128);
  const checked = field('Поступление проверено в банке', 'checkbox');
  const confirm = element('button', 'Подтвердить оплату');
  confirm.className = 'button button-orange';
  form.append(confirm);
  form.addEventListener('submit', event => {
    event.preventDefault();
    update({ action: 'confirm', orderId: order.id, paymentReference: ref.value,
      receivedAmountKzt: amount.valueAsNumber, receiptChecked: checked.checked });
  });
  const rejection = element('form');
  rejection.className = 'billing-form';
  const reasonLabel = element('label', 'Причина отклонения');
  const reason = element('input');
  reason.required = true;
  reason.maxLength = 240;
  reasonLabel.append(reason);
  const reject = element('button', 'Отклонить заявку');
  reject.className = 'button button-light';
  rejection.append(reasonLabel, reject);
  rejection.addEventListener('submit', event => {
    event.preventDefault();
    update({ action: 'reject', orderId: order.id, reason: reason.value });
  });
  details.append(form, rejection);
  return details;
}

function orderRow(order, payment, isAdmin) {
  const row = element('article');
  row.className = 'billing-order';
  row.append(element('strong', order.planName + ' · ' + money(order.amountKzt)),
    element('p', (labels[order.status] || order.status) + ' · ' + date(order.createdAt)),
    element('p', 'Номер заявки ' + order.id));
  if (order.reviewNote) row.append(element('p', order.reviewNote));
  if (order.email && isAdmin) row.append(element('p', order.email));
  if (order.status !== 'pending') return row;
  if (isAdmin) {
    row.append(adminActions(order));
    return row;
  }
  const actions = element('div');
  actions.className = 'billing-order-actions';
  row.append(element('p', 'Карта для перевода: ' + TRANSFER_CARD_DISPLAY),
    element('p', 'Переведите ' + money(order.amountKzt) + '. В сообщении к переводу обязательно укажите email вашего аккаунта SatuCard. Подключим тариф в течение 48 часов после перевода и проверки поступления. При задержке или для запроса возврата обратитесь в поддержку по этой заявке.'));
  if (payment.checkoutUrl) actions.append(link('Открыть страницу оплаты', payment.checkoutUrl, 'button button-orange'));
  const subject = 'Заявка SatuCard ' + order.id;
  actions.append(link('Уточнить оплату в поддержке', 'mailto:' + SUPPORT.emails[0] + '?subject=' + encodeURIComponent(subject)),
    button('Отменить заявку', () => update({ action: 'cancel', orderId: order.id })));
  row.append(actions);
  return row;
}

async function refresh() {
  const version = ++generation;
  try {
    const data = await request();
    if (version !== generation) return;
    status.textContent = data.isAdmin ? 'Доступ администратора'
      : data.active ? data.active.planName + ' · до ' + date(data.active.expiresAt) + ' по времени Казахстана'
      : data.message || 'Бесплатный план. Для sAI можно подключить тариф на 30 дней.';
    $('billing-usage').hidden = !data.active;
    if (data.active) {
      const remaining = data.active.remainingPercent;
      $('billing-progress').value = remaining;
      $('billing-remaining').textContent = data.active.exhausted ? 'Лимит исчерпан'
        : 'Осталось ' + (remaining === 0 ? 'менее 1' : remaining) + '% лимита';
    }
    $('billing-next').hidden = !data.scheduled.length;
    $('billing-next').textContent = data.scheduled.map(plan => plan.planName + ' начнётся ' + date(plan.startsAt)).join(' · ');
    $('billing-models').hidden = !data.models.length;
    $('billing-model-list').replaceChildren(...data.models.map(model => element('li', model.label)));
    $('billing-create').hidden = !data.ordering;
    const select = $('billing-plan');
    const selected = select.value || new URLSearchParams(location.search).get('plan');
    select.replaceChildren(...data.plans.map(plan => {
      const option = element('option', plan.name + ' · ' + money(plan.priceKzt) + ' за ' + plan.days + ' дней');
      option.value = plan.id;
      return option;
    }));
    if (data.plans.some(plan => plan.id === selected)) select.value = selected;
    $('billing-orders').replaceChildren(...(data.orders.length
      ? data.orders.map(order => orderRow(order, data.payment, false)) : [element('p', 'Пока нет покупок.')]));
    $('billing-admin').hidden = !(data.isAdmin && data.ready);
    if (data.isAdmin && data.ready) {
      const queue = await request('?admin=1');
      if (version !== generation) return;
      $('billing-admin-orders').replaceChildren(...(queue.orders.length
        ? queue.orders.map(order => orderRow(order, data.payment, true)) : [element('p', 'Нет заявок на проверку.')]));
    }
  } catch (error) { if (version === generation) status.textContent = error.message; }
}

document.addEventListener('satucard:authchange', event => {
  const next = event.detail?.user?.id || null;
  if (next === accountId) return;
  accountId = next;
  pendingCreate = null;
  status.textContent = 'Проверяем доступ…';
  for (const id of ['billing-admin', 'billing-create', 'billing-usage', 'billing-next', 'billing-models']) $(id).hidden = true;
  for (const id of ['billing-orders', 'billing-admin-orders', 'billing-model-list']) $(id).replaceChildren();
  refresh();
});

$('billing-support').append(link(SUPPORT.phone, SUPPORT.phoneHref),
  ...SUPPORT.emails.map(email => link(email, 'mailto:' + email)));
$('billing-refresh').addEventListener('click', refresh);
$('billing-create').addEventListener('submit', event => {
  event.preventDefault();
  const planId = $('billing-plan').value;
  if (busy || !planId) return;
  if (pendingCreate?.planId !== planId) pendingCreate = { action: 'create', planId, requestId: crypto.randomUUID() };
  update(pendingCreate, () => { pendingCreate = null; });
});
const initialSession = await window.SATUCARD_AUTH?.getSession();
if (accountId === undefined) {
  accountId = initialSession?.user?.id || null;
  refresh();
}
