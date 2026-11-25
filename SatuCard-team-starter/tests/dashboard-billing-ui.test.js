import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { ACCESS_DAYS, BILLING_PLANS, YEARLY_BILLING_PLANS } from '../billing-plans.js';
import { TRANSFER_CARD, TRANSFER_CARD_DISPLAY } from '../payment-requisites.js';
import { SUPPORT } from '../support.js';

const source = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
async function settle(predicate) {
  for (let i = 0; i < 40; i++) {
    if (predicate()) return;
    await new Promise(setImmediate);
  }
  throw new Error('Billing UI did not settle');
}
async function setup({ plan = 'plus', ordering = false, error = false, copy = async () => {} } = {}) {
  const dom = new JSDOM(source('dashboard.html'), {
    url: 'https://satucard.test/dashboard.html?plan=' + plan, runScripts: 'outside-only'
  });
  const w = dom.window, $ = id => w.document.getElementById(id);
  let failing = error;
  const posts = [];
  const data = {
    ready: ordering, ordering, isAdmin: false, active: null, scheduled: [], orders: [], models: [],
    plans: BILLING_PLANS.map(plan => ({ ...plan, days: ACCESS_DAYS })), payment: { checkoutUrl: null },
    message: ordering ? '' : 'Платные тарифы готовятся к запуску.'
  };
  Object.assign(w, { ACCESS_DAYS, BILLING_PLANS, YEARLY_BILLING_PLANS, TRANSFER_CARD, TRANSFER_CARD_DISPLAY, SUPPORT });
  w.SATUCARD_AUTH = { getSession: async () => ({ access_token: 'fixture', user: { id: 'buyer' } }) };
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: copy } });
  w.fetch = async (_url, init = {}) => {
    if (failing) throw new Error('Нет соединения');
    if (init.method === 'POST') posts.push(JSON.parse(init.body));
    return { ok: true, json: async () => data };
  };
  await w.eval('(async () => {\n' + source('dashboard-billing.js').replace(/^import .*;\r?\n/gm, '') + '\n})()');
  await settle(() => ['ready', 'error'].includes($('billing-status').dataset.state));
  return { dom, w, $, posts, data, fail: () => { failing = true; } };
}

test('Plus from pricing shows 2990 KZT and recipient details outside collapsed history even when orders are closed', async () => {
  const app = await setup();
  try {
    assert.equal(app.$('billing-plan').value, 'plus');
    assert.equal(app.$('billing-transfer-amount').textContent, '2\u00a0990 ₸');
    assert.equal(app.$('billing-transfer-period').textContent, 'За 30 дней');
    assert.equal(app.$('billing-transfer-card').value, TRANSFER_CARD_DISPLAY);
    assert.equal(app.$('billing-transfer-card').readOnly, true);
    assert.equal(app.$('billing-transfer-card').closest('details'), null);
    assert.match(app.w.document.querySelector('.billing-transfer-steps').textContent, /email вашего аккаунта SatuCard/);
    assert.match(app.$('billing-transfer-note').textContent, /Приём заявок пока закрыт/);
    assert.equal(app.$('billing-create').hidden, true);
    app.$('billing-create').dispatchEvent(new app.w.Event('submit', { cancelable: true }));
    await new Promise(setImmediate);
    assert.equal(app.posts.length, 0);
  } finally { app.dom.window.close(); }
});

test('changing tariffs updates the amount and refresh preserves the chosen plan', async () => {
  const app = await setup({ ordering: true });
  try {
    for (const [id, amount] of [['basic', 1500], ['max', 4990], ['max3', 9990], ['plus', 2990]]) {
      app.$('billing-plan').value = id;
      app.$('billing-plan').dispatchEvent(new app.w.Event('change'));
      assert.equal(app.$('billing-transfer-amount').textContent, new Intl.NumberFormat('ru-RU').format(amount) + ' ₸');
    }
    // When the server supplies a new quote, the visible amount follows it.
    app.data.plans = app.data.plans.map(plan => plan.id === 'plus' ? { ...plan, priceKzt: 3000 } : plan);
    app.$('billing-refresh').click();
    await settle(() => app.$('billing-status').dataset.state === 'ready');
    assert.equal(app.$('billing-plan').value, 'plus');
    assert.equal(app.$('billing-transfer-amount').textContent, '3\u00a0000 ₸');
    assert.equal(app.$('billing-create').hidden, false);
  } finally { app.dom.window.close(); }
});

test('an available checkout creates a pending request for Plus without sending a client price or confirming payment', async () => {
  const app = await setup({ ordering: true });
  try {
    app.$('billing-create').dispatchEvent(new app.w.Event('submit', { cancelable: true }));
    await settle(() => app.posts.length === 1 && app.$('billing-status').dataset.state === 'ready');
    assert.deepEqual(Object.keys(app.posts[0]).sort(), ['action', 'planId', 'requestId']);
    assert.equal(app.posts[0].action, 'create');
    assert.equal(app.posts[0].planId, 'plus');
    assert.match(app.posts[0].requestId, /^[0-9a-f-]{36}$/);
  } finally { app.dom.window.close(); }
});

test('a failed refresh closes checkout and retains informational details with a clear message', async () => {
  const app = await setup({ ordering: true });
  try {
    app.fail();
    app.$('billing-refresh').click();
    await settle(() => app.$('billing-status').dataset.state === 'error');
    assert.equal(app.$('billing-create').hidden, true);
    assert.match(app.$('billing-transfer-note').textContent, /Не удалось проверить доступность оплаты/);
    assert.equal(app.$('billing-transfer-amount').textContent, '2\u00a0990 ₸');
  } finally { app.dom.window.close(); }
});

test('an unavailable annual plan retains its annual amount rather than silently showing the monthly quote', async () => {
  const app = await setup({ plan: 'plus_yearly', ordering: true });
  try {
    assert.equal(app.$('billing-plan').value, 'plus_yearly');
    assert.equal(app.$('billing-transfer-amount').textContent, '35\u00a0880 ₸');
    assert.match(app.$('billing-transfer-period').textContent, /За год/);
    assert.equal(app.$('billing-create').hidden, true);
    assert.match(app.$('billing-transfer-note').textContent, /тариф пока недоступен/);
  } finally { app.dom.window.close(); }
});

test('copy returns only the card digits and offers manual copying when clipboard access fails', async () => {
  const copied = [];
  let blocked = false;
  const app = await setup({ copy: async value => { if (blocked) throw new Error('Blocked'); copied.push(value); } });
  try {
    app.$('billing-copy-card').click();
    await settle(() => app.$('billing-copy-status').textContent.includes('скопирован.'));
    assert.deepEqual(copied, [TRANSFER_CARD]);
    blocked = true;
    app.$('billing-copy-card').click();
    await settle(() => app.$('billing-copy-status').textContent.includes('вручную'));
    assert.equal(app.posts.length, 0);
  } finally { app.dom.window.close(); }
});
