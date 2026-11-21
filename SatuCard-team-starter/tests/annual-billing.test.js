import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { BILLING_PLANS, YEARLY_BILLING_PLANS } from '../billing-plans.js';
import { billingPlan, publicPlans } from '../lib/billing.js';

test('annual catalogue is exactly twelve prices, retains monthly quota and is gated by database capability', () => {
  assert.equal(publicPlans().length, 4);
  assert.equal(publicPlans(true).length, 8);
  for (const [i, plan] of YEARLY_BILLING_PLANS.entries()) {
    assert.equal(plan.priceKzt, BILLING_PLANS[i].priceKzt * 12);
    assert.equal(plan.tokens, BILLING_PLANS[i].tokens);
    assert.equal(billingPlan(plan.id).months, 12);
  }
  assert.equal(billingPlan('niche10_yearly'), undefined);
});

test('annual payment creates twelve isolated calendar quotas, preserves monthly orders and denies direct client access', async () => {
  const db = new PGlite(), user = randomUUID(), other = randomUUID();
  const rpc = async (name, args = []) => (await db.query(
    'select public.' + name + '(' + args.map((_, i) => '$' + (i + 1)).join(',') + ') as result', args)).rows[0].result;
  try {
    await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);');
    await db.query('insert into auth.users values ($1,$2),($3,$4)', [user, 'a@example.test', other, 'b@example.test']);
    for (const file of ['paid-access.sql', 'free-templates-upgrade.sql', 'annual-billing.sql', 'annual-billing.sql']) {
      await db.exec(await readFile(new URL('../database/' + file, import.meta.url), 'utf8'));
    }
    const monthly = (await rpc('create_billing_order', [user, 'basic', randomUUID()])).order;
    const original = (await rpc('confirm_billing_order', [monthly.id, other, 'monthly', 1500])).grant;
    assert.equal(Date.parse(original.expires_at) - Date.parse(original.starts_at), 30 * 86400000);
    // Anchor to Jan 31 of a leap year to verify calendar math and non-drifting periods.
    let leapYear = new Date().getUTCFullYear() + 1;
    while (new Date(Date.UTC(leapYear, 1, 29)).getUTCMonth() !== 1) leapYear++;
    await db.query('update public.billing_grants set starts_at=$2,expires_at=$3 where id=$1',
      [original.id, leapYear + '-01-01T12:00:00Z', leapYear + '-01-31T12:00:00Z']);
    const id = randomUUID();
    const annual = (await rpc('create_billing_order', [user, 'max_yearly', id])).order;
    assert.equal(annual.amount_kzt, 59880); assert.equal(annual.token_limit, 10000000);
    assert.equal((await rpc('create_billing_order', [user, 'max_yearly', id])).order.id, annual.id);
    await assert.rejects(rpc('create_billing_order', [user, 'max', id]), /Idempotency/);
    await assert.rejects(rpc('confirm_billing_order', [annual.id, other, 'annual', 4990]), /amount/);
    await rpc('confirm_billing_order', [annual.id, other, 'annual', 59880]);
    await rpc('confirm_billing_order', [annual.id, other, 'annual', 59880]);
    const periods = (await db.query('select * from public.billing_grants where order_id=$1 order by period_number', [annual.id])).rows;
    assert.equal(periods.length, 12);
    assert.equal(new Date(periods[0].expires_at).toISOString(), leapYear + '-02-29T12:00:00.000Z');
    assert.equal(new Date(periods[1].expires_at).toISOString(), leapYear + '-03-31T12:00:00.000Z');
    assert.equal(new Date(periods[11].expires_at).toISOString(), (leapYear + 1) + '-01-31T12:00:00.000Z');
    for (let i = 0; i < 12; i++) {
      assert.equal(periods[i].token_limit, 10000000);
      assert.equal(periods[i].tokens_used, 0); assert.equal(periods[i].plan_id, 'max');
      if (i) assert.equal(+new Date(periods[i].starts_at), +new Date(periods[i - 1].expires_at));
    }
    assert.equal((await rpc('get_billing_status', [user])).annualReady, true);
    assert.equal((await rpc('get_billing_status', [other])).orders.length, 0);
    await assert.rejects(rpc('cancel_billing_order', [other, annual.id]), /not found/i);
    // A future allowance cannot be consumed before the current exhausted allowance expires.
    await db.query("update public.billing_grants set starts_at=now()-interval '1 day', expires_at=now()+interval '1 day',tokens_used=token_limit where id=$1", [periods[0].id]);
    const reserve = () => rpc('reserve_paid_ai_attempt', [user, randomUUID(), 'cx/gpt-6-luna', 1000]);
    assert.equal((await reserve()).code, 'paid_quota_exceeded');
    await db.query("update public.billing_grants set starts_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=$1", [periods[0].id]);
    await db.query("update public.billing_grants set starts_at=now()-interval '1 hour',expires_at=now()+interval '1 day' where id=$1", [periods[1].id]);
    assert.equal((await reserve()).allowed, true);
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role);
      await assert.rejects(rpc('create_billing_order', [user, 'max_yearly', randomUUID()]), /permission denied/);
      await assert.rejects(rpc('confirm_billing_order', [annual.id, other, 'annual', 59880]), /permission denied/);
      await assert.rejects(db.query('select * from public.billing_grants'), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    assert.equal((await rpc('get_billing_status', [user])).annualReady, true);
  } finally { await db.close(); }
});
