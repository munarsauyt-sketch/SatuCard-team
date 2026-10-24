import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';

const source = readFileSync(new URL('../auth-client.js', import.meta.url), 'utf8');
const flowKey = 'satucard-google-pkce-v1';
const sessionKey = 'satucard-session-v1';
const origin = 'https://satucard-team.vercel.app';
const storedFlow = () => ({ verifier: 'a'.repeat(64), createdAt: Date.now(), callback: `${origin}/auth.html` });
function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function harness({ url = `${origin}/auth.html`, saved = {}, pending = {}, responder, blockedStorage = false } = {}) {
  let current = new URL(url);
  const calls = [], navigations = [], cleanups = [];
  const local = storage(saved), temporary = storage(pending);
  const location = Object.fromEntries(['href', 'origin', 'protocol', 'hostname', 'pathname', 'search', 'hash'].map(key => [key, current[key]]));
  const setLocation = value => { current = new URL(value, current); for (const key of Object.keys(location)) if (key in current) location[key] = current[key]; };
  location.assign = value => navigations.push(value);
  const listeners = new Map();
  const context = vm.createContext({
    window: { crypto: webcrypto, addEventListener: (event, handler) => listeners.set(event, handler) },
    document: { addEventListener() {}, dispatchEvent() {}, querySelectorAll: () => [] },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    URL, URLSearchParams, TextEncoder, Uint8Array, btoa, location, AbortController, setTimeout, clearTimeout,
    history: { replaceState: (_, __, target) => { cleanups.push(target); setLocation(target); } },
    localStorage: local,
    sessionStorage: blockedStorage ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} } : temporary,
    fetch: async (url, options) => {
      calls.push({ url, options, pageURL: location.href });
      const response = responder?.(url, options) ?? { external: { google: true } };
      return { ok: response.ok ?? true, status: response.status ?? 200, json: async () => response.body ?? response };
    }
  });
  vm.runInContext(source, context);
  return { auth: context.window.SATUCARD_AUTH, calls, navigations, cleanups, local, temporary, location, listeners };
}
const tokenResponse = {
  access_token: 'satu-access', refresh_token: 'satu-refresh', token_type: 'bearer', expires_in: 3600,
  user: { id: 'existing-user', email: 'seller@example.com', user_metadata: { full_name: 'Seller' } },
  provider_token: 'google-access-not-to-be-persisted', provider_refresh_token: 'google-refresh-not-to-be-persisted'
};

test('Google uses S256 PKCE and a fixed callback, ignores arbitrary redirect parameters', async () => {
  const h = harness({ url: `${origin}/auth.html?next=https://attacker.example&mode=signup` });
  await h.auth.signInWithGoogle();
  const target = new URL(h.navigations[0]);
  assert.equal(target.origin, 'https://pnnaqvfcswdroldovbty.supabase.co');
  assert.equal(target.pathname, '/auth/v1/authorize');
  assert.equal(target.searchParams.get('provider'), 'google');
  assert.equal(target.searchParams.get('redirect_to'), `${origin}/auth.html`);
  assert.equal(target.searchParams.get('code_challenge_method'), 's256');
  assert.equal(target.searchParams.get('prompt'), 'select_account');
  const flow = JSON.parse(h.temporary.getItem(flowKey));
  assert.match(flow.verifier, /^[0-9a-f]{64}$/);
  assert.equal(target.searchParams.get('code_challenge'), createHash('sha256').update(flow.verifier).digest('base64url'));
  assert.ok(!target.href.includes(flow.verifier));
  assert.equal(h.local.getItem(sessionKey), null);
  await h.auth.signInWithGoogle();
  assert.equal(h.navigations.length, 1);
});

test('callback exchanges once, scrubs URL first, preserves user id, never persists provider tokens', async () => {
  const h = harness({ url: `${origin}/auth.html?code=single-use&next=https://attacker.example`,
    pending: { [flowKey]: JSON.stringify(storedFlow()) }, responder: () => tokenResponse });
  const first = h.auth.completeGoogleSignIn();
  const second = h.auth.completeGoogleSignIn();
  assert.equal(first, second);
  assert.equal(await first, true);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].pageURL, `${origin}/auth.html`);
  assert.ok(h.calls[0].url.endsWith('/auth/v1/token?grant_type=pkce'));
  assert.deepEqual(JSON.parse(h.calls[0].options.body), { auth_code: 'single-use', code_verifier: 'a'.repeat(64) });
  assert.equal(h.temporary.getItem(flowKey), null);
  const saved = JSON.parse(h.local.getItem(sessionKey));
  assert.equal(saved.user.id, 'existing-user');
  assert.equal(saved.access_token, 'satu-access');
  assert.ok(saved.expires_at * 1000 > Date.now());
  assert.ok(!h.local.getItem(sessionKey).includes('google-access-not-to-be-persisted'));
  assert.ok(!('provider_refresh_token' in saved));
});

test('missing, expired or altered browser flow cannot exchange a callback code', async () => {
  const variants = [null, { ...storedFlow(), createdAt: Date.now() - 11 * 60 * 1000 },
    { ...storedFlow(), createdAt: Date.now() + 60000 },
    { ...storedFlow(), callback: 'https://attacker.example/auth.html' },
    { ...storedFlow(), verifier: 'bad' }];
  for (const flow of variants) {
    const h = harness({ url: `${origin}/auth.html?code=untrusted`, pending: flow ? { [flowKey]: JSON.stringify(flow) } : {} });
    await assert.rejects(h.auth.completeGoogleSignIn(), /устарела|другой вкладке/);
    assert.equal(h.calls.length, 0);
    assert.equal(h.location.search, '');
    assert.equal(h.local.getItem(sessionKey), null);
  }
});

test('provider cancellation clears callback details and keeps the existing session', async () => {
  const existing = { ...tokenResponse, expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const h = harness({ url: `${origin}/auth.html?error=access_denied&error_description=private-detail`,
    saved: { [sessionKey]: JSON.stringify(existing) }, pending: { [flowKey]: JSON.stringify(storedFlow()) } });
  await assert.rejects(h.auth.completeGoogleSignIn(), /отменён/);
  assert.equal(h.location.href, `${origin}/auth.html`);
  assert.equal(h.calls.length, 0);
  assert.equal((await h.auth.getSession()).user.id, existing.user.id);
});

test('implicit token fragments are removed and never accepted as a session', async () => {
  const h = harness({ url: `${origin}/auth.html#access_token=attacker&refresh_token=attacker` });
  assert.equal(h.auth.isGoogleCallback(), true);
  await assert.rejects(h.auth.completeGoogleSignIn(), /устарела/);
  assert.equal(h.location.hash, '');
  assert.equal(h.calls.length, 0);
  assert.equal(h.local.getItem(sessionKey), null);
});

test('unsafe origins, unavailable provider and blocked storage fail before OAuth navigation', async () => {
  const unsafe = harness({ url: 'http://seller.example/auth.html' });
  await assert.rejects(unsafe.auth.signInWithGoogle(), /https/);
  const disabled = harness({ responder: () => ({ external: { google: false } }) });
  await assert.rejects(disabled.auth.signInWithGoogle(), /ещё не подключён/);
  const blocked = harness({ blockedStorage: true });
  await assert.rejects(blocked.auth.signInWithGoogle(), /хранение данных/);
  for (const h of [unsafe, disabled, blocked]) assert.equal(h.navigations.length, 0);
});

test('failed exchange and incomplete server response do not create a session', async () => {
  for (const response of [{ ok: false, status: 400, body: { error_code: 'bad_code_verifier' } }, { access_token: 'partial' }]) {
    const h = harness({ url: `${origin}/auth.html?code=once`, pending: { [flowKey]: JSON.stringify(storedFlow()) }, responder: () => response });
    await assert.rejects(h.auth.completeGoogleSignIn());
    assert.equal(h.local.getItem(sessionKey), null);
    assert.equal(h.temporary.getItem(flowKey), null);
  }
});

test('existing email login still uses the same session storage and endpoint', async () => {
  const h = harness({ responder: () => tokenResponse });
  await h.auth.signIn({ email: 'seller@example.com', password: 'test-only-password' });
  assert.ok(h.calls[0].url.endsWith('grant_type=password'));
  assert.equal((await h.auth.getSession()).user.id, 'existing-user');
  await h.auth.signOut();
  assert.equal(h.local.getItem(sessionKey), null);
});

test('existing expired sessions refresh once when several pages request the session together', async () => {
  const saved = { ...tokenResponse, expires_at: 1 };
  const h = harness({ saved: { [sessionKey]: JSON.stringify(saved) }, responder: () => tokenResponse });
  const [first, second] = await Promise.all([h.auth.getSession(), h.auth.getSession()]);
  assert.equal(first.user.id, saved.user.id);
  assert.equal(second.access_token, first.access_token);
  assert.equal(h.calls.length, 1);
  assert.ok(h.calls[0].url.endsWith('grant_type=refresh_token'));
});

test('email signup still preserves the supplied name and returns a session', async () => {
  const h = harness({ responder: () => tokenResponse });
  await h.auth.signUp({ name: 'Айдана', email: 'seller@example.com', password: 'test-only-password' });
  assert.ok(h.calls[0].url.endsWith('/auth/v1/signup'));
  assert.equal(JSON.parse(h.calls[0].options.body).data.name, 'Айдана');
  assert.equal((await h.auth.getSession()).user.id, tokenResponse.user.id);
});
