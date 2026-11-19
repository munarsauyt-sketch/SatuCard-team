import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('telemetry rate limits survive independent callers, deduplicate events and deny public SQL access', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create table public.profiles(id uuid); create table public.cards(id uuid);');
    for (const name of ['site-telemetry.sql', 'telemetry-rate-limit.sql', 'telemetry-rate-limit.sql']) await db.exec(await readFile(new URL('../database/' + name, import.meta.url), 'utf8'));
    // Freeze transaction time so the fixed-minute boundary cannot make CI flaky.
    await db.exec('begin');
    const record = async (key, session = 'sess_12345678') => (await db.query("select public.record_limited_site_heartbeat($1,$2,'vis_12345678','/editor.html','desktop',true) as r", [key, session])).rows[0].r;
    assert.equal((await record('a'.repeat(64))).allowed, true);
    assert.equal((await record('a'.repeat(64))).duplicate, true);
    assert.equal((await db.query('select sum(views)::int as n from public.site_traffic_daily')).rows[0].n, 1);
    for (let i = 2; i < 60; i++) assert.equal((await record('a'.repeat(64), 'session_' + i)).allowed, true);
    assert.equal((await record('a'.repeat(64), 'rotated_session')).allowed, false);
    for (let key = 1; key <= 9; key++) for (let i = 0; i < 60; i++) assert.equal((await record(key.toString(16).repeat(64))).allowed, true);
    assert.equal((await record('b'.repeat(64))).allowed, false);
    await db.exec('commit');
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.site_telemetry_buckets'), /permission denied/);
    await assert.rejects(record('c'.repeat(64)), /permission denied/);
  } finally { await db.close(); }
});
