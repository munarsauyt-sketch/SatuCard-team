import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { POST, DELETE } from '../api/cards.js';
import { GET as share } from '../api/share.js';

const uid = 'aaac8be7-1386-45b8-8d49-3f9d7f5c9fb6';
const id = '22222222-2222-4222-8222-222222222222';
const originalFetch = globalThis.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_SECRET_KEY;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = originalKey;
});
function setup(handler) {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: uid, email_confirmed_at: '2026-10-26T00:00:00Z' });
    if (String(url).includes('/rest/v1/profiles?')) return Response.json([{ id: uid, name: 'Seller', profile_completed_at: '2026-10-26T00:00:00Z', mail_proof_required: false }]);
    return handler(new URL(url), options);
  };
}
function publication(values = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ title: 'Товар', price: '4900', oldPrice: '', style: 'studio', format: 'portrait', brandName: 'Store', ...values })) form.set(key, value);
  form.set('image', new File([new Uint8Array([255, 216, 255, 217])], 'card.jpg', { type: 'image/jpeg' }));
  return new Request('https://app.test/api/cards', { method: 'POST', headers: { authorization: 'Bearer test.token' }, body: form });
}
test('hidden price and brand remain hidden in publication metadata', async () => {
  let record;
  setup((url, options) => {
    if (url.pathname === '/rest/v1/cards') record = JSON.parse(options.body);
    return new Response(null, { status: 201 });
  });
  const response = await POST(publication({ price: '', showPrice: 'false', showBrand: 'false', contactUrl: 'https://wa.me/77000000000' }));
  assert.equal(response.status, 201);
  assert.equal(record.price_kzt, null);
  assert.equal(record.brand_name, '');
  assert.equal(record.show_price, false);
  assert.equal(record.show_brand, false);
  assert.equal(record.contact_url, 'https://wa.me/77000000000');
});
test('unsafe contact URLs are rejected before any upload', async () => {
  setup(() => { throw new Error('No storage access expected'); });
  for (const contactUrl of ['javascript:alert(1)', 'http://store.test', 'https://user:pass@store.test']) {
    assert.equal((await POST(publication({ contactUrl }))).status, 400);
  }
});
test('replacement uses ownership and image version, preserving the previous card on conflict', async () => {
  let uploaded = false, removedNew = false;
  setup((url, options) => {
    if (url.pathname === '/rest/v1/cards' && !options.method) {
      assert.equal(url.searchParams.get('user_id'), 'eq.' + uid);
      return Response.json([{ id, image_path: id + '.jpg' }]);
    }
    if (url.pathname === '/rest/v1/cards' && options.method === 'PATCH') {
      assert.equal(url.searchParams.get('image_path'), 'eq.' + id + '.jpg');
      assert.equal(url.searchParams.get('user_id'), 'eq.' + uid);
      return Response.json([]);
    }
    if (options.method === 'POST') uploaded = true;
    if (options.method === 'DELETE') { assert.ok(!url.pathname.endsWith('/' + id + '.jpg')); removedNew = true; }
    return new Response(null, { status: 200 });
  });
  const response = await POST(publication({ id, expectedImagePath: id + '.jpg' }));
  assert.equal(response.status, 409);
  assert.ok(uploaded && removedNew);
});
test('unpublish refuses a stale version before deleting anything', async () => {
  setup((url, options) => {
    assert.equal(options.method, undefined);
    assert.equal(url.searchParams.get('user_id'), 'eq.' + uid);
    return Response.json([{ id, image_path: 'latest.jpg' }]);
  });
  const response = await DELETE(new Request('https://app.test/api/cards?id=' + id + '&imagePath=old.jpg', { method: 'DELETE', headers: { authorization: 'Bearer test.token' } }));
  assert.equal(response.status, 409);
});
test('share metadata escapes product content and suppresses a hidden price', async () => {
  setup(() => Response.json([{ id, title: '<script>alert(1)</script>', price_kzt: '999', show_price: false, show_brand: false, image_path: id + '.jpg' }]));
  const response = await share(new Request('https://app.test/api/share?id=' + id));
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.ok(html.includes('og:image'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('999'));
});
test('workflow migration is repeatable and preserves legacy rows', async () => {
  const db = new PGlite();
  try {
    await db.exec("create role service_role; create table cards(id uuid primary key,price_kzt numeric not null); create table editable_projects(id uuid primary key); insert into cards values ('" + id + "',4900)");
    const sql = await readFile(new URL('../database/product-workflow-upgrade.sql', import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql);
    const row = (await db.query('select * from cards')).rows[0];
    assert.equal(Number(row.price_kzt), 4900);
    assert.equal(row.show_price, true);
    assert.equal(row.show_brand, true);
    await db.exec('update cards set price_kzt=null,show_price=false');
  } finally { await db.close(); }
});
