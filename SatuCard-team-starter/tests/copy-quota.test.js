import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { reserveCopyQuota } from '../lib/copy-quota.js';

const migration = await readFile(new URL('../database/ai-copy-quota.sql', import.meta.url), 'utf8');
const userId = index => `aaac8be7-1386-45b8-8d49-${String(index).padStart(12, '0')}`;
async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);`);
  for (let index = 1; index <= 30; index++) await db.query('insert into auth.users values($1)', [userId(index)]);
  await db.exec(migration);
  return db;
}
async function reserve(db, index = 1) {
  const result = await db.query('select public.reserve_ai_copy_attempt($1) as result', [userId(index)]);
  return result.rows[0].result.allowed;
}
test('real PostgreSQL migration is repeatable; only service-role RPC can spend shared quota', async () => {
  const db = await database();
  try {
    await db.exec(migration);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(reserve(db), /permission denied/);
      await assert.rejects(db.query('select * from public.ai_copy_limits'), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    assert.equal(await reserve(db), true);
    await assert.rejects(db.query('update public.ai_copy_limits set project_daily = 100'), /permission denied/);
    await db.exec('reset role');
    const counts = await db.query('select attempts from public.ai_copy_daily_usage');
    assert.equal(counts.rows[0].attempts, 1);
  } finally { await db.close(); }
});
test('shared daily project cap admits only 20 out of 30 requests without negative refunds', async () => {
  const db = await database();
  try {
    const accepted = await Promise.all(Array.from({ length: 30 }, (_, index) => reserve(db, index + 1)));
    assert.equal(accepted.filter(Boolean).length, 20);
    assert.equal((await db.query('select attempts from public.ai_copy_daily_usage')).rows[0].attempts, 20);
    assert.equal(await reserve(db, 30), false);
  } finally { await db.close(); }
});
test('per-user cooldown, daily cap and UTC rollover are durable in PostgreSQL', async () => {
  const db = await database();
  try {
    assert.equal(await reserve(db), true); assert.equal(await reserve(db), false);
    for (let attempt = 2; attempt <= 5; attempt++) {
      await db.query("update public.ai_copy_user_usage set last_attempt = clock_timestamp() - interval '61 seconds' where user_id = $1", [userId(1)]);
      assert.equal(await reserve(db), true);
    }
    await db.query("update public.ai_copy_user_usage set last_attempt = clock_timestamp() - interval '61 seconds' where user_id = $1", [userId(1)]);
    assert.equal(await reserve(db), false);
    await db.exec("update public.ai_copy_user_usage set usage_day = usage_day - 1, last_attempt = clock_timestamp() - interval '1 day'; update public.ai_copy_daily_usage set usage_day = usage_day - 1;");
    assert.equal(await reserve(db), true);
    assert.equal((await db.query('select attempts from public.ai_copy_user_usage')).rows[0].attempts, 1);
    assert.equal((await db.query("select attempts from public.ai_copy_daily_usage where usage_day = (clock_timestamp() at time zone 'UTC')::date")).rows[0].attempts, 1);
  } finally { await db.close(); }
});
test('null/unknown user and missing config fail atomically without spending project allowance', async () => {
  const db = await database();
  try {
    await assert.rejects(db.query('select public.reserve_ai_copy_attempt(null)'), /Missing user/);
    await assert.rejects(reserve(db, 99), /foreign key/);
    assert.equal((await db.query('select count(*) as count from public.ai_copy_daily_usage')).rows[0].count, 0);
    await db.exec('delete from public.ai_copy_limits');
    await assert.rejects(reserve(db), /no rows/);
  } finally { await db.close(); }
});
test('quota HTTP errors, malformed results and timeouts fail closed without retry', async () => {
  const config = { base: 'https://example.supabase.co', key: 'private' };
  let calls = 0;
  for (const value of [null, {}, { allowed: 'true' }]) await assert.rejects(reserveCopyQuota(config, userId(1), { fetcher: async () => { calls++; return Response.json(value); } }));
  assert.equal(calls, 3);
  await assert.rejects(reserveCopyQuota(config, userId(1), { fetcher: async () => new Response('', { status: 404 }) }));
  let signal;
  await assert.rejects(reserveCopyQuota(config, userId(1), { timeoutMs: 5, fetcher: async (_, options) => { signal = options.signal; return new Promise(() => {}); } }), /timeout/);
  assert.equal(signal.aborted, true);
});

test('quota authenticates opaque secret keys via apikey and legacy service keys via Bearer', async () => {
  for (const key of ['sb_secret_example', 'legacy.service.jwt']) {
    let headers;
    assert.equal(await reserveCopyQuota({ base: 'https://example.supabase.co', key }, userId(1), {
      fetcher: async (_, options) => { headers = options.headers; return Response.json({ allowed: true }); }
    }), true);
    assert.equal(headers.apikey, key);
    assert.equal(headers.Authorization, key.startsWith('sb_') ? undefined : `Bearer ${key}`);
  }
});
