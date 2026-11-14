import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { GET as billingStatus, POST as billing } from '../api/billing.js';
import { GET as chatStatus, POST as chat } from '../api/chat.js';

const owner = '11111111-1111-4111-8111-111111111111';
const buyer = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';
const auth = { owner, buyer, other };
const routes = {
  create_billing_order: ['p_user_id', 'p_plan_id', 'p_request_id'],
  confirm_billing_order: ['p_order_id', 'p_admin_user_id', 'p_payment_ref', 'p_received_amount'],
  cancel_billing_order: ['p_user_id', 'p_order_id'],
  get_billing_status: ['p_user_id'],
  get_billing_admin_queue: [],
  reserve_paid_ai_attempt: ['p_user_id', 'p_request_id', 'p_model_id', 'p_token_cap'],
  settle_paid_ai_attempt: ['p_request_id', 'p_total_tokens', 'p_outcome']
};
function request(path, token, body) {
  return new Request('https://satucard.test/api/' + path, {
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {})
  });
}
const message = {
  selectedProvider: 'anymodel', selectedModel: 'cx/gpt-6-luna',
  message: 'Сделай описание короче', history: [],
  card: { title: 'Чашка', subtitle: '', description: 'Керамика', features: [], template: 'studio' },
  facts: 'Керамика', language: 'ru', tone: 'neutral'
};

test('verified payment activates one period and an authorized model uses the reserved quota', async t => {
  const env = {
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'test',
    SAI_PAID_ACCESS_ENABLED: 'true', SAI_PAYMENT_REQUESTS_ENABLED: 'true',
    VERCEL_ENV: 'preview', SAI_PREVIEW_ANYMODEL_ENABLED: 'true', ANYMODEL_API_KEY: 'test',
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
  for (const [token, id] of Object.entries(auth)) await db.query('insert into auth.users values($1, $2)', [id, token + '@example.com']);
  await db.exec(await readFile(new URL('../database/paid-access.sql', import.meta.url), 'utf8'));
  const modelCalls = [];
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/auth/v1/user')) {
      const id = auth[options.headers.Authorization?.slice(7)];
      return id ? Response.json({ id, email_confirmed_at: 'today' }) : new Response(null, { status: 401 });
    }
    if (url.includes('/rest/v1/profiles?')) return Response.json([{ profile_completed_at: 'today', mail_proof_required: false }]);
    if (url.startsWith('https://example.supabase.co/rest/v1/rpc/')) {
      const fn = url.split('/').at(-1);
      assert.ok(Object.hasOwn(routes, fn));
      const data = JSON.parse(options.body);
      const args = routes[fn].map(key => data[key]);
      try {
        const result = await db.query('select public.' + fn + '(' + args.map((_, i) => '$' + (i + 1)).join(',') + ') as result', args);
        return Response.json(result.rows[0].result);
      } catch (error) { return Response.json({ code: error.code }, { status: 400 }); }
    }
    assert.equal(url, 'https://anymodel.org/v1/chat/completions');
    modelCalls.push(JSON.parse(options.body));
    const reserved = await db.query('select tokens_reserved from public.billing_grants where user_id=$1', [buyer]);
    assert.ok(Number(reserved.rows[0].tokens_reserved) > 100);
    return Response.json({
      usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 },
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ reply: 'Готово.', proposal: null }) } }]
    });
  };

  assert.equal((await chat(request('chat', 'buyer', message))).status, 403);
  assert.equal(modelCalls.length, 0);
  const create = { action: 'create', planId: 'basic', requestId, userId: owner, amountKzt: 1, paid: true };
  const orderResponse = await billing(request('billing', 'buyer', create));
  assert.equal(orderResponse.status, 201);
  const { order } = await orderResponse.json();
  assert.equal(order.amountKzt, 1500);
  assert.equal(order.status, 'pending');
  const confirmation = { action: 'confirm', orderId: order.id, paymentReference: 'test-transfer-123', receivedAmountKzt: 1500, receiptChecked: true };
  assert.equal((await billing(request('billing', 'buyer', confirmation))).status, 403);
  assert.equal((await billingStatus(request('billing?admin=1', 'other'))).status, 403);
  assert.equal((await billing(request('billing', 'other', { action: 'cancel', orderId: order.id }))).status, 404);
  assert.equal((await billing(request('billing', 'owner', { ...confirmation, receivedAmountKzt: 1 }))).status, 400);
  assert.equal((await billing(request('billing', 'owner', confirmation))).status, 200);
  assert.equal((await billing(request('billing', 'owner', confirmation))).status, 200);
  const state = await (await billingStatus(request('billing', 'buyer'))).json();
  assert.equal(state.active.planId, 'basic');
  assert.equal(state.scheduled.length, 0);
  assert.equal(Date.parse(state.active.expiresAt) - Date.parse(state.active.startsAt), 30 * 86400000);
  assert.equal(state.active.remainingPercent, 100);
  assert.equal('paymentRef' in state.orders[0], false);
  const info = await (await chatStatus(request('chat', 'buyer'))).json();
  assert.equal(info.paidCustomer, true);
  assert.deepEqual(info.models.map(model => model.id), ['ag/gemini-2.5-flash', 'cx/gpt-6-luna', 'cc/claude-sonnet-5-5']);
  assert.equal((await chat(request('chat', 'buyer', { ...message, selectedModel: 'cx/gpt-6-astra' }))).status, 403);
  assert.equal((await chat(request('chat?previewEvaluation=alibaba', 'buyer', message))).status, 403);
  assert.equal(modelCalls.length, 0);
  const generated = await chat(request('chat', 'buyer', message));
  assert.equal(generated.status, 200);
  assert.equal((await generated.json()).modelUsed, 'cx/gpt-6-luna');
  assert.equal(modelCalls.length, 1);
  assert.equal(modelCalls[0].model, 'cx/gpt-6-luna');
  const finalUsage = await db.query('select tokens_used, tokens_reserved from public.billing_grants where user_id=$1', [buyer]);
  assert.equal(Number(finalUsage.rows[0].tokens_used), 100);
  assert.equal(Number(finalUsage.rows[0].tokens_reserved), 0);
  assert.equal((await (await billingStatus(request('billing', 'other'))).json()).orders.length, 0);
});
