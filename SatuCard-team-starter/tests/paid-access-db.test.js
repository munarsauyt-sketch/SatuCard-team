import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../database/paid-access.sql', import.meta.url), 'utf8');
const user = index => '11111111-1111-4111-8111-' + String(index).padStart(12, '0');
const admin = user(99);
let sequence = 100;
const requestId = () => '22222222-2222-4222-8222-' + String(++sequence).padStart(12, '0');
const amounts = { basic: 1500, plus: 2990, max: 4990, max3: 9990, niche10: 490 };
async function database() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,email text);');
  for (const index of [1, 2, 3, 4, 5, 99]) {
    await db.query('insert into auth.users values($1,$2)', [user(index), 'buyer' + index + '@example.test']);
  }
  await db.exec(migration);
  return db;
}
async function rpc(db, name, values = []) {
  const placeholders = values.map((_value, index) => '$' + (index + 1)).join(',');
  return (await db.query('select public.' + name + '(' + placeholders + ') as result', values)).rows[0].result;
}
async function order(db, index = 1, plan = 'basic', id = requestId()) {
  return (await rpc(db, 'create_billing_order', [user(index), plan, id])).order;
}
async function confirm(db, saved, ref = 'payment-' + ++sequence) {
  return rpc(db, 'confirm_billing_order', [saved.id, admin, ref, saved.amount_kzt]);
}
async function grant(db, index = 1, plan = 'basic') {
  return (await confirm(db, await order(db, index, plan))).grant;
}
async function reserve(db, index = 1, model = 'cx/gpt-6-luna', cap = 1000, id = requestId()) {
  return rpc(db, 'reserve_paid_ai_attempt', [user(index), id, model, cap]);
}
async function resetCooldown(db, index = 1) {
  await db.query("update public.billing_accounts set last_attempt_at = clock_timestamp() - interval '3 seconds' where user_id=$1", [user(index)]);
}
async function status(db, index = 1) { return rpc(db, 'get_billing_status', [user(index)]); }

test('paid migration is repeatable, RLS is enabled, and only service-role RPC access is granted', async () => {
  const db = await database();
  try {
    assert.equal((await db.query('select daily_provider_units from public.paid_ai_limits')).rows[0].daily_provider_units, 20000000);
    await db.exec('update public.paid_ai_limits set daily_provider_units=1234');
    await db.exec(migration);
    assert.equal((await db.query('select daily_provider_units from public.paid_ai_limits')).rows[0].daily_provider_units, 1234);
    const tables = ['billing_accounts', 'billing_orders', 'billing_grants', 'paid_ai_limits', 'paid_ai_daily_usage', 'paid_ai_reservations'];
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role);
      for (const table of tables) await assert.rejects(db.query('select * from public.' + table), /permission denied/);
      for (const [name, values] of [
        ['create_billing_order', [user(1), 'basic', requestId()]],
        ['confirm_billing_order', [requestId(), admin, 'ref', 1000]],
        ['cancel_billing_order', [user(1), requestId()]],
        ['reject_billing_order', [requestId(), admin, 'reason']],
        ['get_billing_status', [user(1)]], ['get_billing_admin_queue', []],
        ['reserve_paid_ai_attempt', [user(1), requestId(), 'cx/gpt-6-luna', 100]],
        ['settle_paid_ai_attempt', [requestId(), 0, 'rejected']]
      ]) await assert.rejects(rpc(db, name, values), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    assert.equal((await order(db)).status, 'pending');
    for (const table of tables) await assert.rejects(db.query('select * from public.' + table), /permission denied/);
    await db.exec('reset role');
    const policies = await db.query("select relrowsecurity from pg_class where relname = any($1)", [tables]);
    assert.equal(policies.rows.length, tables.length);
    assert.ok(policies.rows.every(row => row.relrowsecurity));
  } finally { await db.close(); }
});

test('order creation snapshots server prices and scopes idempotency to one user and plan', async () => {
  const db = await database();
  try {
    for (const [plan, allowance, tier] of [['basic', 5000000, 1], ['plus', 8000000, 2], ['max', 10000000, 3], ['max3', 30000000, 3]]) {
      const id = requestId();
      const first = await order(db, 1, plan, id);
      assert.equal(first.amount_kzt, amounts[plan]);
      assert.equal(first.token_limit, allowance);
      assert.equal(first.tier, tier);
      assert.equal(first.duration_days, 30);
      assert.equal((await order(db, 1, plan, id)).id, first.id);
      assert.notEqual((await order(db, 2, plan, id)).id, first.id);
      await assert.rejects(order(db, 1, plan === 'basic' ? 'plus' : 'basic', id), /Idempotency key/);
    }
    await assert.rejects(order(db, 1, 'client-price'), /Unknown plan/);
    assert.equal((await status(db)).orders.length, 4);
    assert.equal((await status(db, 2)).orders.length, 4);
    const queue = await rpc(db, 'get_billing_admin_queue');
    assert.equal(queue.orders.length, 8);
    assert.ok(queue.orders.every(row => row.email.startsWith('buyer')));
  } finally { await db.close(); }
});

test('payment amount is exact, confirmation is idempotent, and references cannot fund two orders', async () => {
  const db = await database();
  try {
    const first = await order(db);
    await assert.rejects(rpc(db, 'confirm_billing_order', [first.id, admin, 'bank-ref', 999]), /amount does not match/);
    assert.equal((await status(db)).active, null);
    const accepted = await confirm(db, first, 'bank-ref');
    const duplicate = await confirm(db, first, 'bank-ref');
    assert.equal(duplicate.grant.id, accepted.grant.id);
    assert.equal(duplicate.grant.expires_at, accepted.grant.expires_at);
    assert.equal(Date.parse(accepted.grant.expires_at) - Date.parse(accepted.grant.starts_at), 30 * 86400000);
    await assert.rejects(confirm(db, first, 'different-ref'), /reference mismatch/);
    const second = await order(db, 2, 'basic');
    await assert.rejects(confirm(db, second, 'bank-ref'), /unique constraint/);
    assert.equal((await status(db, 2)).orders[0].status, 'pending');
    assert.equal((await status(db, 2)).active, null);
    const racedOrder = await order(db, 3);
    const raced = await Promise.all([confirm(db, racedOrder, 'concurrent-ref'), confirm(db, racedOrder, 'concurrent-ref')]);
    assert.equal(raced[0].grant.id, raced[1].grant.id);
    assert.equal((await db.query('select count(*) as count from public.billing_grants')).rows[0].count, 2);
  } finally { await db.close(); }
});

test('cancellation hides foreign orders and cancellation/rejection cannot undo a confirmed order', async () => {
  const db = await database();
  try {
    const own = await order(db);
    await assert.rejects(rpc(db, 'cancel_billing_order', [user(2), own.id]), /Order not found/);
    assert.equal((await status(db)).orders[0].status, 'pending');
    assert.equal((await rpc(db, 'cancel_billing_order', [user(1), own.id])).order.status, 'cancelled');
    assert.equal((await rpc(db, 'cancel_billing_order', [user(1), own.id])).order.status, 'cancelled');
    await assert.rejects(confirm(db, own), /not pending/);
    const rejected = await order(db);
    assert.equal((await rpc(db, 'reject_billing_order', [rejected.id, admin, 'Payment could not be verified'])).order.status, 'rejected');
    await assert.rejects(confirm(db, rejected), /not pending/);
    const paid = await order(db);
    await confirm(db, paid);
    await assert.rejects(rpc(db, 'cancel_billing_order', [user(1), paid.id]), /not pending/);
    await assert.rejects(rpc(db, 'reject_billing_order', [paid.id, admin, 'reason']), /not pending/);
    assert.equal((await rpc(db, 'get_billing_admin_queue')).orders.length, 0);
  } finally { await db.close(); }
});

test('renewals queue without losing days and expired/revoked access never authorizes requests', async () => {
  const db = await database();
  try {
    const initial = await grant(db);
    const renewal = await grant(db, 1, 'plus');
    assert.equal(renewal.starts_at, initial.expires_at);
    const current = await status(db);
    assert.equal(current.active.id, initial.id);
    assert.equal(current.scheduled[0].id, renewal.id);
    await db.query("update public.billing_grants set starts_at=clock_timestamp()-interval '31 days', expires_at=clock_timestamp()-interval '1 day' where id=$1", [initial.id]);
    assert.equal((await status(db)).active, null);
    assert.equal((await reserve(db)).code, 'access_expired');
    await db.query("update public.billing_grants set starts_at=clock_timestamp()-interval '1 hour', expires_at=clock_timestamp()+interval '1 day', revoked_at=clock_timestamp() where id=$1", [initial.id]);
    assert.equal((await reserve(db)).code, 'access_expired');
    assert.equal((await status(db, 2)).orders.length, 0);
  } finally { await db.close(); }
});

test('database model tiers and provider multipliers are independently enforced', async () => {
  const db = await database();
  try {
    await grant(db, 1, 'basic'); await grant(db, 2, 'plus'); await grant(db, 3, 'max');
    assert.equal((await reserve(db, 1, 'cc/claude-opus-4-8')).code, 'plan_required');
    assert.equal((await reserve(db, 2, 'cc/claude-opus-5-5')).code, 'plan_required');
    assert.equal((await reserve(db, 3, 'client-supplied/model')).code, 'model_unavailable');
    for (const [model, expected] of [
      ['ag/gemini-2.5-flash', 60], ['cx/gpt-6-luna', 75], ['cc/claude-sonnet-5-5', 180],
      ['cx/gpt-6.1-terra', 150], ['cx/gpt-6-sol', 200], ['cc/claude-opus-4-8', 400],
      ['cx/gpt-6-astra', 400], ['cx/gpt-6.1-sol', 200], ['cc/claude-opus-5-5', 600]
    ]) {
      await resetCooldown(db, 3);
      const id = requestId();
      assert.equal((await reserve(db, 3, model, 100, id)).allowed, true);
      const saved = (await db.query('select provider_cap_units from public.paid_ai_reservations where request_id=$1', [id])).rows[0];
      assert.equal(saved.provider_cap_units, expected);
      await rpc(db, 'settle_paid_ai_attempt', [id, 0, 'rejected']);
    }
    assert.equal((await db.query('select units from public.paid_ai_daily_usage')).rows[0].units, 0);
  } finally { await db.close(); }
});

test('quota reserves before usage, settles once, and prevents duplicate requests or overflow', async () => {
  const db = await database();
  try {
    const access = await grant(db);
    await db.query('update public.billing_grants set token_limit=1500 where id=$1', [access.id]);
    const id = requestId();
    assert.equal((await reserve(db, 1, 'cx/gpt-6-luna', 1000, id)).allowed, true);
    assert.equal((await status(db)).active.tokens_reserved, 1000);
    assert.equal((await reserve(db, 1, 'cx/gpt-6-luna', 1000, id)).code, 'duplicate_request');
    await assert.rejects(rpc(db, 'settle_paid_ai_attempt', [id, -1, 'success']), /Invalid quota/);
    await assert.rejects(rpc(db, 'settle_paid_ai_attempt', [id, 1001, 'success']), /exceeds reservation/);
    assert.equal((await status(db)).active.tokens_reserved, 1000);
    assert.equal((await rpc(db, 'settle_paid_ai_attempt', [id, 500, 'success'])).settled, true);
    await rpc(db, 'settle_paid_ai_attempt', [id, 500, 'success']);
    assert.equal((await status(db)).active.tokens_used, 500);
    assert.equal((await status(db)).active.tokens_reserved, 0);
    assert.equal((await db.query('select units from public.paid_ai_daily_usage')).rows[0].units, 375);
    await resetCooldown(db);
    assert.equal((await reserve(db, 1, 'cx/gpt-6-luna', 1001)).code, 'paid_quota_exceeded');
    assert.equal((await reserve(db, 1, 'cx/gpt-6-luna', '9223372036854775807')).code, 'paid_quota_exceeded');
    await assert.rejects(reserve(db, 1, 'cx/gpt-6-luna', -1), /Invalid quota/);
  } finally { await db.close(); }
});

test('cooldown and inflight limits survive overlapping callers, and global units never exceed the ceiling', async () => {
  const db = await database();
  try {
    for (const index of [1, 2, 3, 4]) await grant(db, index, 'max');
    const first = requestId();
    assert.equal((await reserve(db, 1, 'cx/gpt-6-luna', 1000, first)).allowed, true);
    assert.equal((await reserve(db)).code, 'ai_cooldown');
    await resetCooldown(db);
    assert.equal((await reserve(db)).allowed, true);
    await resetCooldown(db);
    assert.equal((await reserve(db)).code, 'ai_busy');
    await rpc(db, 'settle_paid_ai_attempt', [first, 0, 'rejected']);
    assert.equal((await reserve(db)).allowed, true);
    // Different users race against one shared provider ceiling.
    await db.exec('update public.paid_ai_limits set daily_provider_units=13500');
    const results = await Promise.all([2, 3, 4].map(index => reserve(db, index, 'cc/claude-opus-5-5', 1000)));
    assert.equal(results.filter(value => value.allowed).length, 2);
    const units = (await db.query('select units from public.paid_ai_daily_usage')).rows[0].units;
    assert.equal(units, 13500);
  } finally { await db.close(); }
});

test('uncertain/stale reservations retain full cost, release inflight slots, and late callbacks cannot refund', async () => {
  const db = await database();
  try {
    await grant(db);
    const uncertain = requestId();
    await reserve(db, 1, 'cx/gpt-6-luna', 1000, uncertain);
    await rpc(db, 'settle_paid_ai_attempt', [uncertain, null, 'failed']);
    assert.equal((await status(db)).active.tokens_used, 1000);
    assert.equal((await status(db)).active.tokens_reserved, 0);
    await resetCooldown(db);
    const stale = requestId();
    await reserve(db, 1, 'cx/gpt-6-luna', 1000, stale);
    await db.query("update public.paid_ai_reservations set created_at=clock_timestamp()-interval '121 seconds' where request_id=$1", [stale]);
    await resetCooldown(db);
    assert.equal((await reserve(db, 1, 'cx/gpt-6-luna', 500)).allowed, true);
    const current = (await status(db)).active;
    assert.equal(current.tokens_used, 2000);
    assert.equal(current.tokens_reserved, 500);
    assert.equal((await db.query('select units from public.paid_ai_daily_usage')).rows[0].units, 1875);
    await rpc(db, 'settle_paid_ai_attempt', [stale, 100, 'success']);
    assert.equal((await status(db)).active.tokens_used, 2000);
    assert.equal((await db.query('select units from public.paid_ai_daily_usage')).rows[0].units, 1875);
  } finally { await db.close(); }
});

test('settlement refunds unused units on the original UTC usage day', async () => {
  const db = await database();
  try {
    await grant(db);
    const id = requestId();
    await reserve(db, 1, 'cx/gpt-6-luna', 1000, id);
    await db.exec("insert into public.paid_ai_daily_usage select usage_day-1, units from public.paid_ai_daily_usage; update public.paid_ai_reservations set usage_day=usage_day-1; update public.paid_ai_daily_usage set units=0 where usage_day=(clock_timestamp() at time zone 'UTC')::date;");
    await rpc(db, 'settle_paid_ai_attempt', [id, 400, 'success']);
    const counters = await db.query("select units, usage_day=(clock_timestamp() at time zone 'UTC')::date as today from public.paid_ai_daily_usage order by usage_day");
    assert.deepEqual(counters.rows.map(row => [row.today, row.units]), [[false, 300], [true, 0]]);
  } finally { await db.close(); }
});
