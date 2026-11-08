import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST } from '../api/copy.js';
const originalFetch = globalThis.fetch;
const keys = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'OPENAI_API_KEY', 'OPENAI_COPY_MODEL', 'OPENAI_COPY_ALLOWED_USER_IDS'];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
afterEach(() => { globalThis.fetch = originalFetch; for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
let counter = 0;
let id;
const input = { language: 'kk', title: 'Кесе', facts: 'Ақ түс', tone: 'friendly' };
function setup({ confirmed = true, complete = true, proof = false, provider = 'ok' } = {}) {
  id = `aaac8be7-1386-45b8-8d49-${String(++counter).padStart(12, '0')}`;
  process.env.OPENAI_COPY_ALLOWED_USER_IDS = id;
  process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_SECRET_KEY = 'private-supabase'; process.env.OPENAI_API_KEY = 'private-ai';
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/auth/v1/user')) return Response.json({ id, email_confirmed_at: confirmed ? 'today' : null });
    if (url.includes('/rest/v1/profiles?')) return Response.json([{ id, profile_completed_at: complete ? 'today' : null, mail_proof_required: proof }]);
    if (url === 'https://api.openai.com/v1/chat/completions') {
      if (provider === 'error') throw new Error('private-ai');
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: provider === 'invalid' ? '{}' : JSON.stringify({ title: 'Кесе', subtitle: 'Тауармен танысыңыз', description: 'Ақ түс', features: ['Ақ түс'] }) } }] });
    }
    throw new Error('Unexpected request');
  };
  return calls;
}
function request(body = input, auth = true, type = 'application/json') {
  return new Request('https://example.com/api/copy', { method: 'POST', headers: { 'content-type': type, ...(auth ? { authorization: 'Bearer test.token.signature' } : {}) }, body: JSON.stringify(body) });
}
test('availability never calls provider or exposes secrets', async () => {
  const calls = setup(); assert.deepEqual(await GET().json(), { available: true }); assert.equal(calls.length, 0);
  delete process.env.OPENAI_API_KEY; assert.deepEqual(await GET().json(), { available: false });
});
test('full account verification precedes generation', async () => {
  let calls = setup(); assert.equal((await POST(request(input, false))).status, 401); assert.equal(calls.length, 0);
  for (const options of [{ confirmed: false }, { complete: false }, { proof: true }]) {
    calls = setup(options); assert.equal((await POST(request())).status, 403); assert.ok(calls.every(call => !call.url.includes('openai.com')));
  }
});
test('unavailable credentials and invalid requests never use provider', async () => {
  let calls = setup(); delete process.env.OPENAI_API_KEY; assert.equal((await POST(request())).status, 503);
  assert.equal(calls.length, 2);
  for (const body of [{ ...input, language: 'en' }, { ...input, facts: 'x'.repeat(20000) }]) {
    calls = setup(); assert.equal((await POST(request(body))).status, 400); assert.equal(calls.length, 2);
  }
  setup(); assert.equal((await POST(request(input, true, 'text/plain'))).status, 415);
});
test('successful response minimizes provider data and errors remain generic', async () => {
  const calls = setup(); const response = await POST(request({ ...input, email: 'never-send@example.com', photo: 'private-image', token: 'private-token' }));
  assert.equal(response.status, 200); assert.equal((await response.json()).source, 'ai');
  const body = JSON.parse(calls.at(-1).options.body); assert.deepEqual(JSON.parse(body.messages[1].content), input);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  for (const provider of ['error', 'invalid']) { setup({ provider }); const result = await POST(request()); assert.equal(result.status, 502); assert.ok(!(await result.text()).includes('private-ai')); }
});

test('paid API is closed without an explicit account allowlist', async () => {
  const calls = setup(); delete process.env.OPENAI_COPY_ALLOWED_USER_IDS;
  assert.deepEqual(await GET().json(), { available: false });
  assert.equal((await POST(request())).status, 403);
  assert.equal(calls.length, 2);
  process.env.OPENAI_COPY_ALLOWED_USER_IDS = '*';
  assert.deepEqual(await GET().json(), { available: false });
  assert.equal((await POST(request())).status, 403);
});
test('repeat calls are throttled before provider use, including after provider failure', async () => {
  for (const provider of ['ok', 'error']) {
    const calls = setup({ provider });
    assert.equal((await POST(request())).status, provider === 'ok' ? 200 : 502);
    const response = await POST(request());
    assert.equal(response.status, 429); assert.equal((await response.json()).code, 'ai_rate_limited');
    assert.equal(calls.filter(call => call.url.includes('openai.com')).length, 1);
  }
});
test('daily per-instance allowance resets on the next UTC day', async () => {
  setup(); const realNow = Date.now; let now = Date.UTC(2030, 0, 1);
  Date.now = () => now;
  try {
    for (let index = 0; index < 20; index++) { assert.equal((await POST(request())).status, 200); now += 11000; }
    assert.equal((await POST(request())).status, 429);
    now += 86400000; assert.equal((await POST(request())).status, 200);
  } finally { Date.now = realNow; }
});
