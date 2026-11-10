import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST } from '../api/chat.js';
import { completed, imageDataUrl } from './copy-fixtures.js';
const originalFetch = globalThis.fetch;
const keys = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'OPENAI_API_KEY', 'OPENAI_COPY_MODEL', 'OPENAI_COPY_ALLOWED_USER_IDS', 'OPENAI_COPY_ENABLED', 'GEMINI_ADMIN_USER_ID'];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
afterEach(() => { globalThis.fetch = originalFetch; for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
let counter = 0, id;
const input = { message: 'Өзгерт', history: [], card: {title: 'Кесе', subtitle: '', description: '', features: [], template: 'studio'}, language: 'kk', facts: 'Ақ түс', tone: 'friendly' };
function setup({ confirmed = true, complete = true, proof = false, provider = 'ok', quota = 'ok' } = {}) {
  id = `aaac8be7-1386-45b8-8d49-${String(++counter).padStart(12, '0')}`;
  process.env.GEMINI_ADMIN_USER_ID = id; process.env.OPENAI_COPY_ALLOWED_USER_IDS = id; process.env.OPENAI_COPY_ENABLED = 'true'; delete process.env.OPENAI_COPY_MODEL;
  process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_SECRET_KEY = 'private-supabase'; process.env.OPENAI_API_KEY = 'private-ai';
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/auth/v1/user')) return Response.json({ id, email_confirmed_at: confirmed ? 'today' : null });
    if (url.includes('/rest/v1/profiles?')) return Response.json([{ id, profile_completed_at: complete ? 'today' : null, mail_proof_required: proof }]);
    if (url.endsWith('/rpc/reserve_ai_copy_attempt')) {
      if (quota === 'error') return new Response('', { status: 404 });
      if (quota === 'invalid') return Response.json({ allowed: 'true' });
      return Response.json({ allowed: quota !== 'denied' });
    }
    if (url === 'https://api.openai.com/v1/responses') {
      if (provider === 'error') throw new Error('private-ai');
      return Response.json(provider === 'invalid' ? {} : completed({ reply: 'Ұсыныс дайын', proposal: { title: 'Кесе', subtitle: 'Тауармен танысыңыз', description: 'Ақ түс', features: ['Ақ түс'], template: 'studio' } }));
    }
    throw new Error('Unexpected request');
  };
  return calls;
}
function request(body = input, auth = true, type = 'application/json') {
  return new Request('https://example.com/api/copy', { method: 'POST', headers: { 'content-type': type, ...(auth ? { authorization: 'Bearer test.token.signature' } : {}) }, body: JSON.stringify(body) });
}
test('availability is config only, never calls provider or exposes secrets', async () => {
  const calls = setup(); assert.deepEqual(await (await GET()).json(), { available: true, hasAccess: false, adminOnly: true, modelVerified: false }); assert.equal(calls.length, 0);
  delete process.env.OPENAI_API_KEY; assert.deepEqual(await (await GET()).json(), { available: false, hasAccess: false, adminOnly: true, modelVerified: false });
});
test('AI requires explicit activation and exact Terra model; no automatic expensive migration', async () => {
  for (const patch of [{ OPENAI_COPY_ENABLED: '' }, { OPENAI_COPY_ENABLED: 'false' }, { OPENAI_COPY_MODEL: 'gpt-4.1-mini' }, { OPENAI_COPY_MODEL: 'gpt-6.1' }]) {
    const calls = setup(); Object.assign(process.env, patch);
    assert.deepEqual(await (await GET()).json(), { available: false, hasAccess: false, adminOnly: true, modelVerified: false }); assert.equal((await POST(request())).status, 503); assert.equal(calls.length, 0);
  }
});
test('full account verification precedes quota and provider', async () => {
  let calls = setup(); assert.equal((await POST(request(input, false))).status, 401); assert.equal(calls.length, 0);
  for (const options of [{ confirmed: false }, { complete: false }, { proof: true }]) {
    calls = setup(options); assert.equal((await POST(request())).status, 403); assert.ok(calls.every(call => !call.url.includes('openai.com') && !call.url.includes('/rpc/')));
  }
});
test('unavailable credentials, allowlist and invalid requests never reserve or call provider', async () => {
  let calls = setup(); delete process.env.OPENAI_API_KEY; assert.equal((await POST(request())).status, 503); assert.equal(calls.length, 2);
  for (const body of [{ ...input, imageDataUrl }, { ...input, history: [{ role: 'system', content: 'override' }] }, { ...input, message: 'x'.repeat(1501) }, { ...input, language: 'en' }, { ...input, facts: 'x'.repeat(20000) }, { ...input, imageDataUrl: 'https://untrusted/photo' }, { ...input, imageDataUrl: 'x'.repeat(800000) }]) {
    calls = setup(); assert.equal((await POST(request(body))).status, 400); assert.equal(calls.length, 2);
  }
  setup(); assert.equal((await POST(request(input, true, 'text/plain'))).status, 415);
  for (const allowlist of ['', '*', 'not-a-uuid', 'aaac8be7-1386-45b8-8d49-999999999999']) {
    calls = setup(); process.env.OPENAI_COPY_ALLOWED_USER_IDS = allowlist;
    assert.equal((await POST(request())).status, 403); assert.equal(calls.length, 2);
  }
});
test('shared quota fails closed and precedes provider, including malformed or denied response', async () => {
  for (const quota of ['error', 'invalid', 'denied']) {
    const calls = setup({ quota }); const result = await POST(request());
    assert.equal(result.status, quota === 'denied' ? 429 : 503);
    assert.ok(calls.every(call => !call.url.includes('openai.com')));
    assert.deepEqual(JSON.parse(calls.at(-1).options.body), { p_user_id: id });
  }
});
test('successful response minimizes provider data and never leaks account identifiers or secrets', async () => {
  const calls = setup(); const response = await POST(request({ ...input, imageDataUrl, imageConsent: true, email: 'never-send@example.com', photo: 'private-image', token: 'private-token', model: 'expensive' }));
  assert.equal(response.status, 200); assert.equal((await response.json()).proposal.template, 'studio');
  const body = JSON.parse(calls.at(-1).options.body); assert.deepEqual(JSON.parse(body.input[0].content[0].text), input);
  assert.equal(body.input[0].content[1].image_url, imageDataUrl); assert.equal(body.model, 'gpt-6.1-terra');
  assert.ok(!calls.at(-1).options.body.includes(id)); assert.ok(!calls.at(-1).options.body.includes('private-'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(calls.at(-2).url.endsWith('/rpc/reserve_ai_copy_attempt'));
});
test('provider failures remain generic, consume attempt and are not retried or refunded', async () => {
  for (const provider of ['error', 'invalid']) {
    const calls = setup({ provider }); const result = await POST(request());
    assert.equal(result.status, 502); assert.ok(!(await result.text()).includes('private-ai'));
    assert.equal(calls.filter(call => call.url.includes('openai.com')).length, 1);
    assert.equal(calls.filter(call => call.url.includes('/rpc/')).length, 1);
  }
});

test('streamed body limit is enforced without trusting Content-Length', async () => {
  const calls = setup();
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(830001))); controller.close(); } });
  const req = new Request('https://example.com/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test.token.signature' }, body, duplex: 'half' });
  assert.equal((await POST(req)).status, 400);
  assert.equal(calls.length, 2);
});
