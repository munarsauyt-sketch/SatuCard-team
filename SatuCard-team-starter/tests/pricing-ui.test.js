import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { ACCESS_DAYS, BILLING_PLANS } from '../billing-plans.js';

test('plan selection reaches the authenticated account before revealing payment details', () => {
  const dom = new JSDOM(readFileSync(new URL('../pricing.html', import.meta.url), 'utf8'), { url: 'https://satucard.test/pricing.html', runScripts: 'outside-only' });
  try {
    const w = dom.window;
    w.document.documentElement.dataset.theme = 'dark';
    Object.assign(w, { ACCESS_DAYS, BILLING_PLANS });
    w.eval(readFileSync(new URL('../pricing.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, ''));
    for (const plan of BILLING_PLANS) {
      const card = w.document.querySelector('[data-plan="' + plan.id + '"]');
      const link = card.querySelector('a.pricing-button');
      const url = new URL(link.href);
      assert.equal(url.pathname, '/dashboard.html');
      assert.equal(url.searchParams.get('plan'), plan.id);
      assert.equal(url.searchParams.get('theme'), 'dark');
      assert.equal(url.hash, '#billing-title');
      assert.match(card.querySelector('.pricing-price').textContent, new RegExp(new Intl.NumberFormat('ru-RU').format(plan.priceKzt)));
      assert.equal(card.querySelector('details').open, false);
      assert.ok(card.querySelector('.pricing-purpose').textContent);
    }
    assert.equal(w.document.querySelector('#transfer-card'), null);
    assert.match(w.document.body.textContent, /48 часов/);
  } finally { dom.window.close(); }
});
