import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { JSDOM } from 'jsdom';
import { POST, GET } from '../api/telemetry.js';
import { hashMonitorToken, validateHeartbeat } from '../lib/telemetry.js';

const originalFetch = globalThis.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_SECRET_KEY;
const originalMonitorKey = process.env.SATUCARD_MONITOR_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = originalKey;
  if (originalMonitorKey === undefined) delete process.env.SATUCARD_MONITOR_KEY; else process.env.SATUCARD_MONITOR_KEY = originalMonitorKey;
});

test('validateHeartbeat normalizes allowed routes and rejects unsafe input', () => {
  assert.deepEqual(
    validateHeartbeat({ sessionId: 'sess_12345678', visitorId: 'vis_12345678', path: '/', device: 'mobile', isPageview: true }),
    { sessionId: 'sess_12345678', visitorId: 'vis_12345678', path: '/index.html', device: 'mobile', isPageview: true }
  );
  assert.equal(validateHeartbeat({ sessionId: 'short', visitorId: 'vis_12345678', path: '/editor.html', device: 'desktop' }), null);
  assert.equal(validateHeartbeat({ sessionId: 'sess_12345678', visitorId: 'vis_12345678', path: '/etc/passwd', device: 'desktop' }), null);
  assert.equal(validateHeartbeat({ sessionId: 'sess_12345678', visitorId: 'vis_12345678', path: '/editor.html', device: 'fridge' }), null);
});

test('site-telemetry SQL migration is repeatable and aggregates online & daily traffic accurately', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create table public.profiles (id uuid primary key);
      create table public.cards (id uuid primary key);
      insert into public.profiles values (gen_random_uuid()), (gen_random_uuid());
      insert into public.cards values (gen_random_uuid());
    `);
    const sql = await readFile(new URL('../database/site-telemetry.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);

    const token = 'monitor-secret-token-for-unit-test-1234';
    const tokenHash = hashMonitorToken(token);
    await db.query('insert into public.site_monitor_config (id, token_hash) values (1, $1)', [tokenHash]);

    await db.query("select public.record_site_heartbeat('sess_mobile_1', 'vis_user_one', '/editor.html', 'mobile', true)");
    await db.query("select public.record_site_heartbeat('sess_mobile_1', 'vis_user_one', '/video.html', 'mobile', true)");
    await db.query("select public.record_site_heartbeat('sess_desktop_1', 'vis_user_two', '/index.html', 'desktop', true)");
    await db.query("select public.record_site_heartbeat('sess_desktop_1', 'vis_user_two', '/index.html', 'desktop', false)");

    const denied = (await db.query("select public.get_site_telemetry_summary($1) as summary", [hashMonitorToken('wrong-token')])).rows[0].summary;
    assert.equal(denied.authorized, false);

    const summary = (await db.query("select public.get_site_telemetry_summary($1) as summary", [tokenHash])).rows[0].summary;
    assert.equal(summary.authorized, true);
    assert.equal(summary.online.total, 2);
    assert.equal(summary.online.byDevice.mobile, 1);
    assert.equal(summary.online.byDevice.desktop, 1);
    assert.equal(summary.traffic.today.visitors, 2);
    assert.equal(summary.traffic.today.views, 3);
    assert.equal(summary.traffic.days30.views, 3);
    assert.equal(summary.traffic.dailySeries.length, 14);
    assert.equal(summary.product.totalUsers, 2);
    assert.equal(summary.product.totalPublishedCards, 1);
  } finally {
    await db.close();
  }
});

test('POST and GET /api/telemetry enforce validation, bounds, and admin monitor auth', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  const monitorKey = 'super-secret-monitor-key-0123456789';

  let rpcCall = null;
  globalThis.fetch = async (url, options = {}) => {
    rpcCall = { url: String(url), body: JSON.parse(options.body) };
    if (String(url).includes('record_site_heartbeat')) return Response.json({ ok: true });
    if (String(url).includes('get_site_telemetry_summary')) {
      if (rpcCall.body.p_token_hash !== hashMonitorToken(monitorKey)) {
        return Response.json({ authorized: false });
      }
      return Response.json({ authorized: true, online: { total: 4 } });
    }
    return new Response('{}', { status: 404 });
  };

  const badPost = await POST(new Request('https://app.test/api/telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'sess_12345678', visitorId: 'vis_12345678', path: '/bad.php', device: 'desktop' })
  }));
  assert.equal(badPost.status, 400);

  const bigPost = await POST(new Request('https://app.test/api/telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '99999' },
    body: 'x'.repeat(3000)
  }));
  assert.equal(bigPost.status, 413);

  const okPost = await POST(new Request('https://app.test/api/telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'sess_12345678', visitorId: 'vis_12345678', path: '/editor.html', device: 'desktop', isPageview: true })
  }));
  assert.equal(okPost.status, 200);
  assert.equal(rpcCall.body.p_path, '/editor.html');

  const unauthGet = await GET(new Request('https://app.test/api/telemetry'));
  assert.equal(unauthGet.status, 401);

  const wrongKeyGet = await GET(new Request('https://app.test/api/telemetry', {
    headers: { 'x-monitor-key': 'wrong-key-value-123456' }
  }));
  assert.equal(wrongKeyGet.status, 401);

  const okGet = await GET(new Request('https://app.test/api/telemetry', {
    headers: { 'x-monitor-key': monitorKey }
  }));
  assert.equal(okGet.status, 200);
  const summary = await okGet.json();
  assert.equal(summary.online.total, 4);
});

test('theme.js exposes telemetry helpers without firing auto-requests in jsdom', async () => {
  const code = await readFile(new URL('../theme.js', import.meta.url), 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://satucard.kz/editor.html', runScripts: 'outside-only' });
  const w = dom.window;
  let calls = [];
  w.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response('{}', { status: 200 }); };
  w.eval(code);
  assert.equal(calls.length, 0);
  await w.SATUCARD_TELEMETRY.sendHeartbeat(true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'api/telemetry');
  assert.equal(calls[0].body.path, '/editor.html');
  assert.equal(calls[0].body.isPageview, true);
});
