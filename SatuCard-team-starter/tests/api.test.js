import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../api/cards.js';
import { GET } from '../api/card.js';
import { GET as GET_MINE } from '../api/my-cards.js';

const savedFetch = globalThis.fetch;
const savedUrl = process.env.SUPABASE_URL;
const savedKey = process.env.SUPABASE_SECRET_KEY;

afterEach(() => {
  globalThis.fetch = savedFetch;
  if (savedUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = savedUrl;
  if (savedKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = savedKey;
});

function configure() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
}

function uploadRequest(overrides = {}) {
  const form = new FormData();
  form.set('title', overrides.title ?? 'Беспроводные наушники');
  form.set('price', overrides.price ?? '24990');
  form.set('oldPrice', overrides.oldPrice ?? '29990');
  form.set('style', overrides.style ?? 'studio');
  form.set('format', overrides.format ?? 'portrait');
  form.set('brandName', overrides.brandName ?? 'Мой магазин');
  form.set('image', overrides.image ?? new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], 'card.jpg', { type: 'image/jpeg' }));
  return new Request('https://satucard.example/api/cards', {
    method: 'POST',
    headers: overrides.authorized === false ? {} : { Authorization: 'Bearer test.jwt.token' },
    body: form
  });
}

test('rejects malformed prices and image before contacting Supabase', async () => {
  configure();
  globalThis.fetch = async url => {
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'aaac8be7-1386-45b8-8d49-3f9d7f5c9fb6' });
    throw new Error('Unexpected database access');
  };

  const priceResponse = await POST(uploadRequest({ price: 'not-a-price' }));
  assert.equal(priceResponse.status, 400);

  const fakeJpeg = new File(['not a jpeg'], 'card.jpg', { type: 'image/jpeg' });
  const imageResponse = await POST(uploadRequest({ image: fakeJpeg }));
  assert.equal(imageResponse.status, 400);
});

test('uploads the JPEG and stores card metadata with a secret key', async () => {
  configure();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'aaac8be7-1386-45b8-8d49-3f9d7f5c9fb6' });
    return new Response(null, { status: options.method === 'POST' ? 201 : 200 });
  };

  const response = await POST(uploadRequest());
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.match(result.id, /^[0-9a-f-]{36}$/);
  assert.equal(result.url, `https://satucard.example/card.html?id=${result.id}`);
  assert.equal(calls.length, 3);
  assert.match(calls[1].url, new RegExp(`/storage/v1/object/cards/${result.id}\\.jpg$`));
  assert.equal(calls[1].options.headers.apikey, 'sb_secret_test');
  assert.equal(calls[2].url, 'https://example.supabase.co/rest/v1/cards');
  assert.equal(calls[2].options.headers.apikey, 'sb_secret_test');
  const record = JSON.parse(calls[2].options.body);
  assert.equal(record.user_id, 'aaac8be7-1386-45b8-8d49-3f9d7f5c9fb6');
  assert.equal(record.price_kzt, '24990.00');
  assert.equal(record.old_price_kzt, '29990.00');
  assert.equal(record.image_path, `${result.id}.jpg`);
});

test('publishes a neon story card and keeps its verified owner', async () => {
  configure();
  let stored;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'aaac8be7-1386-45b8-8d49-3f9d7f5c9fb6' });
    if (String(url).endsWith('/rest/v1/cards')) stored = JSON.parse(options.body);
    return new Response(null, { status: 201 });
  };

  const response = await POST(uploadRequest({ style: 'neon', format: 'story' }));
  assert.equal(response.status, 201);
  assert.equal(stored.style, 'neon');
  assert.equal(stored.format, 'story');
  assert.equal(stored.user_id, 'aaac8be7-1386-45b8-8d49-3f9d7f5c9fb6');
});

test('rejects unknown templates and formats before uploading any image', async () => {
  configure();
  let backendCalls = 0;
  globalThis.fetch = async url => {
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'aaac8be7-1386-45b8-8d49-3f9d7f5c9fb6' });
    backendCalls += 1;
    throw new Error('Invalid metadata must not reach Storage or Postgres');
  };

  for (const overrides of [{ style: 'unknown' }, { format: 'unknown' }]) {
    const response = await POST(uploadRequest(overrides));
    assert.equal(response.status, 400);
  }
  assert.equal(backendCalls, 0);
});

test('removes the uploaded image if saving metadata fails', async () => {
  configure();
  const methods = [];
  globalThis.fetch = async (_url, options) => {
    if (String(_url).endsWith('/auth/v1/user')) return Response.json({ id: 'aaac8be7-1386-45b8-8d49-3f9d7f5c9fb6' });
    methods.push(options.method);
    return new Response(null, { status: methods.length === 2 ? 500 : 200 });
  };

  const response = await POST(uploadRequest());
  assert.equal(response.status, 502);
  assert.deepEqual(methods, ['POST', 'POST', 'DELETE']);
});

test('refuses publication without a verified account', async () => {
  configure();
  globalThis.fetch = () => { throw new Error('Unexpected database access'); };
  const response = await POST(uploadRequest({ authorized: false }));
  assert.equal(response.status, 401);
});

test('lists only cards belonging to the verified user', async () => {
  configure();
  const id = 'aaac8be7-1386-45b8-8d49-3f9d7f5c9fb6';
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id });
    assert.match(String(url), /user_id=eq\./);
    assert.match(String(url), new RegExp(id));
    return Response.json([{ id, title: 'Мой товар', price_kzt: '1000.00', style: 'studio', format: 'portrait', created_at: '2026-10-11T00:00:00Z', image_path: `${id}.jpg` }]);
  };
  const response = await GET_MINE(new Request('https://satucard.example/api/my-cards', { headers: { Authorization: 'Bearer test.jwt.token' } }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.cards[0].title, 'Мой товар');
});

test('loads a published card and returns a public image URL', async () => {
  configure();
  const id = 'f8555200-17bf-4a83-83cb-df12f7f83b19';
  globalThis.fetch = async (url, options) => {
    assert.match(url, /id=eq\./);
    assert.equal(options.headers.apikey, 'sb_secret_test');
    return Response.json([{
      id,
      title: 'Беспроводные наушники',
      price_kzt: '24990.00',
      old_price_kzt: null,
      style: 'studio',
      format: 'portrait',
      brand_name: 'Мой магазин',
      image_path: `${id}.jpg`,
      created_at: '2026-10-11T00:00:00Z'
    }]);
  };

  const response = await GET(new Request(`https://satucard.example/api/card?id=${id}`));
  assert.equal(response.status, 200);
  const card = await response.json();
  assert.equal(card.title, 'Беспроводные наушники');
  assert.equal(card.imageUrl, `https://example.supabase.co/storage/v1/object/public/cards/${id}.jpg`);
});

test('returns not found without exposing internal configuration', async () => {
  configure();
  globalThis.fetch = async () => Response.json([]);
  const response = await GET(new Request('https://satucard.example/api/card?id=f8555200-17bf-4a83-83cb-df12f7f83b19'));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Карточка не найдена.' });
});
