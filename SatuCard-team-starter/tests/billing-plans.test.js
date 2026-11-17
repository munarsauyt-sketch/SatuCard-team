import test from 'node:test';
import assert from 'node:assert/strict';
import { BILLING_PLANS, ONE_TIME_PACKS, createDemoReceipt } from '../billing-plans.js';

test('Team plan has the same period, triple token budget, and five seats at 9990 KZT, while 10 niche pack is free', () => {
  const max = BILLING_PLANS.find(plan => plan.id === 'max');
  const triple = BILLING_PLANS.find(plan => plan.id === 'max3');
  assert.equal(triple.tokens, max.tokens * 3);
  assert.equal(triple.priceKzt, 9990);
  const niche = ONE_TIME_PACKS.find(pack => pack.id === 'niche10');
  assert.equal(niche.priceKzt, 0);
  assert.equal(niche.free, true);
});
test('a successful demo has a thirty-day example and charges zero', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  const receipt = createDemoReceipt('basic', 'success', now);
  assert.equal(receipt.mode, 'demo');
  assert.equal(receipt.chargedKzt, 0);
  assert.equal(Date.parse(receipt.accessExampleUntil) - now, 30 * 86400000);
});
test('failed or cancelled demos have no access period, and unknown plans are rejected', () => {
  for (const outcome of ['declined', 'cancelled']) {
    assert.equal(createDemoReceipt('plus', outcome).accessExampleUntil, null);
  }
  assert.throws(() => createDemoReceipt('tampered-price', 'success'));
  assert.throws(() => createDemoReceipt('basic', 'paid'));
});
