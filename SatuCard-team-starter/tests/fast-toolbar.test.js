import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { BILLING_PLANS } from '../billing-plans.js';
import { GET as billingStatus, POST as billing } from '../api/billing.js';

const owner = '11111111-1111-4111-8111-111111111111';
const buyer = '22222222-2222-4222-8222-222222222222';
const freeUser = '33333333-3333-4333-8333-333333333333';
const requestId = '55555555-5555-4555-8555-555555555555';
const auth = { owner, buyer, freeUser };

const routes = {
  create_billing_order: ['p_user_id', 'p_plan_id', 'p_request_id'],
  confirm_billing_order: ['p_order_id', 'p_admin_user_id', 'p_payment_ref', 'p_received_amount'],
  get_billing_status: ['p_user_id']
};

function request(token, body) {
  return new Request('https://satucard.test/api/billing', {
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {})
  });
}

test('basic paid plan (ИИ Старт 1500 KZT) advertises Fast Toolbar and editor wires the toggle safely', async () => {
  const basic = BILLING_PLANS.find(p => p.id === 'basic');
  assert.equal(basic.priceKzt, 1500);
  assert.ok(basic.benefits.some(b => /Быстрый тулбар/i.test(b)), 'Expected Fast Toolbar benefit on basic plan');

  const html = await readFile(new URL('../editor.html', import.meta.url), 'utf8');
  assert.match(html, /fast-toolbar\.css/);
  assert.match(html, /fast-toolbar\.js/);
  assert.match(html, /id="fast-toolbar-toggle"/);
  assert.match(html, /id="fast-toolbar-upsell"/);
  assert.match(html, /pricing\.html\?plan=basic#sai-plan-switch/);
});

test('GET /api/billing unlocks fastToolbar for ИИ Старт (1500 KZT) and admin, while keeping free accounts locked', async t => {
  const env = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'test',
    SAI_PAID_ACCESS_ENABLED: 'true',
    SAI_PAYMENT_REQUESTS_ENABLED: 'true',
    GEMINI_ADMIN_USER_ID: owner
  };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const db = new PGlite();
  t.after(async () => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await db.close();
  });

  Object.assign(process.env, env);
  await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key, email text);');
  for (const [token, id] of Object.entries(auth)) {
    await db.query('insert into auth.users values($1, $2)', [id, token + '@example.com']);
  }
  await db.exec(await readFile(new URL('../database/paid-access.sql', import.meta.url), 'utf8'));

  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/auth/v1/user')) {
      const id = auth[options.headers.Authorization?.slice(7)];
      return id ? Response.json({ id, email_confirmed_at: 'today' }) : new Response(null, { status: 401 });
    }
    if (url.includes('/rest/v1/profiles?')) {
      return Response.json([{ profile_completed_at: 'today', mail_proof_required: false }]);
    }
    const name = url.split('/rest/v1/rpc/')[1];
    if (name && routes[name]) {
      const args = JSON.parse(options.body || '{}');
      const params = routes[name];
      const placeholders = params.map((_, i) => '$' + (i + 1)).join(', ');
      const sql = `select public.${name}(${placeholders}) as data`;
      const res = await db.query(sql, params.map(p => args[p]));
      return Response.json(res.rows[0].data);
    }
    throw new Error('Unexpected fetch: ' + url);
  };

  // Free user: locked
  const freeBefore = await (await billingStatus(request('freeUser'))).json();
  assert.equal(freeBefore.fastToolbar, false);
  assert.equal(freeBefore.active, null);

  // Admin: unlocked even without paid order
  const adminRes = await (await billingStatus(request('owner'))).json();
  assert.equal(adminRes.isAdmin, true);
  assert.equal(adminRes.fastToolbar, true);

  // Buyer before confirmation: still locked
  const createRes = await billing(request('buyer', { action: 'create', planId: 'basic', requestId }));
  assert.equal(createRes.status, 201);
  const { order } = await createRes.json();
  const buyerPending = await (await billingStatus(request('buyer'))).json();
  assert.equal(buyerPending.fastToolbar, false);

  // Admin confirms 1500 KZT payment -> basic plan activates -> fastToolbar unlocks!
  const confirmRes = await billing(request('owner', {
    action: 'confirm',
    orderId: order.id,
    paymentReference: 'KASPI-FT-1500',
    receivedAmountKzt: 1500,
    receiptChecked: true
  }));
  assert.equal(confirmRes.status, 200);

  const buyerActive = await (await billingStatus(request('buyer'))).json();
  assert.equal(buyerActive.active.planId, 'basic');
  assert.equal(buyerActive.fastToolbar, true);

  // Free user remains locked
  const freeAfter = await (await billingStatus(request('freeUser'))).json();
  assert.equal(freeAfter.fastToolbar, false);
});
