import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST } from '../api/profile.js';
import { POST as publish } from '../api/cards.js';
import { GET as myCards } from '../api/my-cards.js';

const originalFetch = globalThis.fetch, originalUrl = process.env.SUPABASE_URL, originalKey = process.env.SUPABASE_SECRET_KEY;
const userId = 'aaac8be7-1386-45b8-8d49-3f9d7f5c9fb6';
const user = { id: userId, email: 'owner@example.com', email_confirmed_at: '2026-10-26T12:00:00Z' };
const profile = { id: userId, name: 'Old Google Name', email: user.email, first_name: '', last_name: '', profile_completed_at: null, mail_proof_required: true };
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of [['SUPABASE_URL', originalUrl], ['SUPABASE_SECRET_KEY', originalKey]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
function setup({ activeUser = user, activeProfile = profile, validToken = true } = {}) {
  process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  const writes = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/auth/v1/user')) return Response.json(activeUser, { status: validToken ? 200 : 401 });
    if (String(url).includes('/rest/v1/profiles?')) {
      if (options.method === 'PATCH') {
        writes.push({ url, data: JSON.parse(options.body) });
        return Response.json([{ ...activeProfile, ...writes.at(-1).data }]);
      }
      return Response.json([activeProfile]);
    }
    throw new Error('Protected data must not be accessed');
  };
  return writes;
}
function request({ method = 'GET', proof = 'oauth', body, headers = {}, sub = userId } = {}) {
  const payload = Buffer.from(JSON.stringify({ sub, amr: [{ method: proof }] })).toString('base64url');
  return new Request('https://satucard.example/api/profile', { method,
    headers: { Authorization: `Bearer header.${payload}.test-signature`, ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
}

test('unconfirmed email and invalid bearer cannot read or change a profile', async () => {
  setup({ activeUser: { ...user, email_confirmed_at: null } });
  for (const handler of [GET, POST]) {
    const result = await handler(request({ method: handler === POST ? 'POST' : 'GET', body: handler === POST ? {} : undefined }));
    assert.equal(result.status, 403); assert.equal((await result.json()).code, 'email_unconfirmed');
  }
  setup({ validToken: false });
  assert.equal((await GET(request())).status, 401);
});

test('legacy password sessions remain blocked even with a linked Google identity or editable verified metadata', async () => {
  setup({ activeUser: { ...user, user_metadata: { email_verified: true }, identities: [{ provider: 'google' }] } });
  for (const handler of [GET, myCards]) {
    const result = await handler(request({ proof: 'password' }));
    assert.equal(result.status, 403); assert.equal((await result.json()).code, 'mail_proof_required');
  }
  assert.equal((await GET(request({ proof: 'oauth', sub: 'other-user' }))).status, 403);
});

test('legacy OAuth and email OTP are accepted but private verification flags are not returned', async () => {
  setup();
  for (const proof of ['oauth', 'otp']) {
    const result = await GET(request({ proof })); assert.equal(result.status, 200);
    const data = await result.json(); assert.equal(data.profile.id, userId); assert.equal('mail_proof_required' in data.profile, false);
  }
  setup({ activeProfile: { ...profile, mail_proof_required: false } });
  assert.equal((await GET(request({ proof: 'password' }))).status, 200);
});

test('an authenticated but incomplete profile cannot publish or list private cards', async () => {
  const writes = setup();
  const form = new FormData(); form.set('title', 'Product');
  const auth = request().headers.get('authorization');
  const result = await publish(new Request('https://satucard.example/api/cards', { method: 'POST', headers: { Authorization: auth }, body: form }));
  assert.equal(result.status, 403); assert.equal((await result.json()).code, 'profile_incomplete');
  assert.equal((await myCards(request())).status, 403); assert.equal(writes.length, 0);
});

test('profile save validates real text, keeps the verified owner and ignores client-supplied ownership or security fields', async () => {
  const writes = setup();
  const result = await POST(request({ method: 'POST', body: { firstName: '  Айдана ', lastName: 'Садық-қызы', id: 'another-user', email: 'attacker@example.com', mail_proof_required: false } }));
  assert.equal(result.status, 200); assert.equal(writes.length, 1);
  assert.ok(writes[0].url.endsWith(`id=eq.${userId}`));
  assert.deepEqual(Object.keys(writes[0].data).sort(), ['email', 'first_name', 'last_name', 'name', 'profile_completed_at']);
  assert.equal(writes[0].data.name, 'Айдана Садық-қызы'); assert.equal(writes[0].data.email, user.email);
  assert.ok(Number.isFinite(Date.parse(writes[0].data.profile_completed_at)));
  assert.equal('mail_proof_required' in (await result.json()).profile, false);
});

test('missing, executable, oversized and malformed profile input cannot alter the database', async () => {
  const writes = setup();
  for (const body of [{ firstName: '', lastName: 'Seller' }, { firstName: '<script>', lastName: 'Seller' },
    { firstName: 'A'.repeat(40), lastName: 'Seller' }, '{invalid json', 'x'.repeat(4097)]) {
    assert.ok((await POST(request({ method: 'POST', body }))).status >= 400);
  }
  assert.equal(writes.length, 0);
});
