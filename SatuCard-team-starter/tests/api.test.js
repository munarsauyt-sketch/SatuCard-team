import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../api/cards.js';
import { GET } from '../api/card.js';

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
  return new Request('https://satucard.example/api/cards', { method: 'POST', body: form });
}

test('rejects malformed prices and image before contacting Supabase', async () => {
  configure();
  globalThis.fetch = () => { throw new Error('Unexpected database access'); };

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
    return new Response(null, { status: options.method === 'POST' ? 201 : 200 });
  };

  const response = await POST(uploadRequest());
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.match(result.id, /^[0-9a-f-]{36}$/);
  assert.equal(result.url, `https://satucard.example/card.html?id=${result.id}`);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, new RegExp(`/storage/v1/object/cards/${result.id}\\.jpg$`));
  assert.equal(calls[0].options.headers.apikey, 'sb_secret_test');
  assert.equal(calls[1].url, 'https://example.supabase.co/rest/v1/cards');
  assert.equal(calls[1].options.headers.apikey, 'sb_secret_test');
  const record = JSON.parse(calls[1].options.body);
  assert.equal(record.price_kzt, '24990.00');
  assert.equal(record.old_price_kzt, '29990.00');
  assert.equal(record.image_path, `${result.id}.jpg`);
});

test('removes the uploaded image if saving metadata fails', async () => {
  configure();
  const methods = [];
  globalThis.fetch = async (_url, options) => {
    methods.push(options.method);
    return new Response(null, { status: methods.length === 2 ? 500 : 200 });
  };

  const response = await POST(uploadRequest());
  assert.equal(response.status, 502);
  assert.deepEqual(methods, ['POST', 'POST', 'DELETE']);
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
