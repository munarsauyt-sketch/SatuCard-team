import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { ACCESS_DAYS, BILLING_PLANS } from '../billing-plans.js';
import { TRANSFER_CARD, TRANSFER_CARD_DISPLAY } from '../payment-requisites.js';
import { SUPPORT } from '../support.js';

function setup(copy = async () => {}) {
  const dom = new JSDOM(readFileSync(new URL('../pricing.html', import.meta.url), 'utf8'), {
    url: 'https://satucard.test/pricing.html', runScripts: 'outside-only'
  });
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: copy } });
  Object.assign(w, { ACCESS_DAYS, BILLING_PLANS, TRANSFER_CARD, TRANSFER_CARD_DISPLAY, SUPPORT });
  w.eval(readFileSync(new URL('../pricing.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, ''));
  return { dom, w, $: id => w.document.getElementById(id) };
}

test('each tariff opens its actual transfer amount and account instructions without demo payment actions', () => {
  const app = setup();
  try {
    for (const plan of BILLING_PLANS) {
      app.w.document.querySelector(`[data-plan="${plan.id}"] button`).click();
      assert.equal(app.$('transfer-checkout').open, true);
      assert.equal(app.$('checkout-plan').textContent, plan.name);
      assert.equal(app.$('checkout-price').textContent, new Intl.NumberFormat('ru-RU').format(plan.priceKzt) + ' ₸');
      assert.equal(new URL(app.$('checkout-account').href).searchParams.get('plan'), plan.id);
    }
    assert.equal(app.$('transfer-card').value, '4400 4303 3768 3400');
    assert.equal(app.$('transfer-card').readOnly, true);
    assert.match(app.$('checkout-instructions').textContent, /email вашего аккаунта SatuCard/);
    assert.match(app.$('checkout-instructions').textContent, /Дождитесь проверки поступления/);
    assert.equal(app.w.document.querySelector('[data-payment-result]'), null);
    assert.equal(app.$('transfer-support').href, 'mailto:' + SUPPORT.emails[0]);
  } finally { app.dom.window.close(); }
});

test('copy uses the exact card digits and reports copying without claiming payment success', async () => {
  const copied = [];
  const app = setup(async text => copied.push(text));
  try {
    app.$('copy-transfer-card').click();
    await new Promise(setImmediate);
    assert.deepEqual(copied, ['4400430337683400']);
    assert.equal(app.$('copy-transfer-status').textContent, 'Номер карты скопирован.');
    app.w.document.querySelector('[data-plan="plus"] button').click();
    assert.equal(app.$('copy-transfer-status').textContent, '');
  } finally { app.dom.window.close(); }
});

test('blocked clipboard leaves the card available for manual copying', async () => {
  const app = setup(async () => { throw new Error('Clipboard blocked'); });
  try {
    app.$('copy-transfer-card').click();
    await new Promise(setImmediate);
    assert.match(app.$('copy-transfer-status').textContent, /скопируйте его вручную/);
    assert.equal(app.$('transfer-card').value.replaceAll(' ', ''), TRANSFER_CARD);
  } finally { app.dom.window.close(); }
});
