import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { GET as chatStatus, POST as chat } from '../api/chat.js';
import { GET as copyStatus, POST as copy } from '../api/copy.js';

const owner = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
const settings = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'test',
  SATUCARD_AI_PROVIDER: 'gemini', GEMINI_CHAT_ENABLED: 'true', GEMINI_API_KEY: 'test',
  GEMINI_ALLOWED_USER_IDS: owner + ',' + member, GEMINI_ADMIN_USER_ID: owner,
  OPENAI_COPY_ENABLED: 'true', OPENAI_COPY_ALLOWED_USER_IDS: owner + ',' + member,
  OPENAI_API_KEY: 'test'
};
const saved = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
function setup() {
  Object.assign(process.env, settings);
  globalThis.fetch = async (url, init) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({
      id: init.headers.Authorization === 'Bearer owner' ? owner : member, email_confirmed_at: 'today',
      user_metadata: { name: 'Мунар Сауыт', admin: true, plan: 'max' }
    });
    if (url.includes('/rest/v1/profiles?')) return Response.json([{ profile_completed_at: 'today', mail_proof_required: false }]);
    throw new Error('Access rejection must precede quota and provider calls');
  };
}
function request(token, method = 'GET') {
  return new Request('https://example.com/api/chat', {
    method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'content-type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify({ userId: owner, admin: true, paid: true, plan: 'max', selectedProvider: 'anymodel' }) } : {})
  });
}
test('only the verified administrator receives AI access status on both routes', async () => {
  setup();
  for (const status of [chatStatus, copyStatus]) {
    assert.equal((await (await status(request())).json()).hasAccess, false);
    assert.equal((await (await status(request('member'))).json()).hasAccess, false);
    assert.equal((await (await status(request('owner'))).json()).hasAccess, true);
  }
});
test('allowlisting and client-supplied names, roles or subscription flags cannot unlock AI', async () => {
  setup();
  for (const generate of [chat, copy]) {
    const response = await generate(request('member', 'POST'));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'ai_subscription_required');
  }
});
test('missing or invalid administrator configuration denies generation before usage', async () => {
  setup();
  for (const value of ['', 'invalid-user-id']) {
    process.env.GEMINI_ADMIN_USER_ID = value;
    for (const generate of [chat, copy]) assert.equal((await generate(request('owner', 'POST'))).status, 403);
  }
});
