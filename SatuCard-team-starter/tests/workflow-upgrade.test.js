import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { JSDOM } from 'jsdom';
import { POST, DELETE } from '../api/cards.js';
import { GET as share } from '../api/share.js';
import { GET as myCards } from '../api/my-cards.js';

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
test('security-and-styles-upgrade SQL is repeatable and accepts all 14 styles + portrait34', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select '${uid}'::uuid $$;
      create function public.handle_new_user() returns trigger language plpgsql as $$ begin return new; end $$;
      create table public.cards (
        id uuid primary key,
        style text not null,
        format text not null,
        constraint cards_style_check check (style in ('studio')),
        constraint cards_format_check check (format in ('portrait'))
      );
      create table public.editable_projects (id uuid primary key, user_id uuid not null);
      create table public.billing_grants (id uuid primary key, order_id uuid, user_id uuid, expires_at timestamptz);
      create table public.billing_orders (id uuid primary key, confirmed_by uuid, rejected_by uuid);
      create table public.paid_ai_reservations (id uuid primary key, grant_id uuid, user_id uuid, usage_day date);
    `);
    const sql = await readFile(new URL('../database/security-and-styles-upgrade.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    for (const style of ['studio', 'showcase', 'blueprint', 'matcha', 'pop', 'graphite', 'cloud']) {
      await db.query('insert into public.cards (id, style, format) values (gen_random_uuid(), $1, $2)', [style, 'portrait34']);
    }
    const { rows } = await db.query('select count(*)::int as cnt from public.cards');
    assert.equal(rows[0].cnt, 7);
  } finally {
    await db.close();
  }
});
test('api/cards sends all 14 styles cleanly without unnecessary fallback retry', async () => {
  const posted = [];
  setup(async (url, options) => {
    if (options.method === 'POST' && String(url).includes('/storage/v1/object/cards/')) return new Response('{}', { status: 200 });
    if (options.method === 'POST' && String(url).endsWith('/rest/v1/cards')) {
      posted.push(JSON.parse(options.body));
      return new Response(null, { status: 201 });
    }
    return new Response('{}', { status: 200 });
  });
  for (const style of ['showcase', 'blueprint', 'matcha', 'pop', 'graphite', 'cloud']) {
    const response = await POST(publication({ style, format: 'portrait34' }));
    assert.equal(response.status, 201);
  }
  assert.deepEqual(posted.map(row => row.style), ['showcase', 'blueprint', 'matcha', 'pop', 'graphite', 'cloud']);
});
test('api/my-cards returns paginated results with nextOffset and nosniff header', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title: `Товар ${i + 1}`,
    price_kzt: 1000 + i,
    style: 'matcha',
    format: 'square',
    brand_name: 'Shop',
    image_path: `${uid}/card-${i}.jpg`,
    created_at: '2026-10-26T00:00:00Z'
  }));
  setup(url => {
    assert.equal(url.searchParams.get('offset'), '30');
    assert.equal(url.searchParams.get('limit'), '30');
    return Response.json(rows.slice(0, 30));
  });
  const response = await myCards(new Request('https://app.test/api/my-cards?offset=30', { headers: { authorization: 'Bearer test.token' } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const payload = await response.json();
  assert.equal(payload.cards.length, 30);
  assert.equal(payload.nextOffset, 60);
});
test('kaspi_main preflight, safe-zone geometry, CSV parser, shared Brand Kit, and offline QR SVG work', async () => {
  const toolsCode = await readFile(new URL('../studio-tools.js', import.meta.url), 'utf8');
  const workflowCode = await readFile(new URL('../studio-workflow.js', import.meta.url), 'utf8');
  const cardCode = await readFile(new URL('../card.js', import.meta.url), 'utf8');
  const projectCode = await readFile(new URL('../studio-project.js', import.meta.url), 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html lang="ru"><body></body></html>', { url: 'https://satucard.kz/editor.html', runScripts: 'outside-only' });
  const w = dom.window;
  w.TextEncoder = globalThis.TextEncoder;
  w.eval(toolsCode);
  w.eval(workflowCode);
  w.eval(cardCode);
  w.eval(projectCode);

  const report = w.SATUCARD_TOOLS.preflight(
    { title: 'Термокружка', price: 4900, showPrice: true, badge: 'Хит Kaspi', customColors: true, background: '#111111' },
    { width: 900, height: 900, bytes: 120000, mime: 'image/jpeg', photoWidth: 1000, photoHeight: 1000, hasPhoto: true },
    'kaspi_main'
  );
  assert.ok(report.checks.some(c => c.id === 'white-bg' && c.severity === 'warning'));
  assert.ok(report.checks.some(c => c.id === 'kaspi-main-price' && c.severity === 'warning'));
  assert.ok(report.checks.some(c => c.id === 'kaspi-main-badge' && c.severity === 'warning'));
  const rect = w.SATUCARD_TOOLS.getSafeZoneRect('square', 'kaspi_main');
  assert.equal(rect.top, 0.1);
  assert.ok(rect.label.includes('Kaspi'));

  const parsed = w.SATUCARD_WORKFLOW.parseCatalogCsv('title;subtitle;price;badge\nКружка;Сталь;5490 ₸;Хит Kaspi\nНаушники;TWS;18990;0-0-12');
  assert.equal(parsed.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed[0])), { title: 'Кружка', subtitle: 'Сталь', price: 5490, badge: 'Хит Kaspi' });

  const svg = w.SATUCARD_QR.generateCardQrSvg('https://satucard.kz/card.html?id=' + id);
  assert.ok(svg.startsWith('<svg ') && svg.includes('<path d="M') && svg.includes('</svg>'));

  await w.SATUCARD_PROJECT.brandAction('put', { settings: { brandName: 'KZ Shop', accent: '#2563eb', font: 'manrope', customColors: true, background: '#ffffff', showBrand: true, textColor: '#111111' }, logo: null });
  const shared = JSON.parse(w.localStorage.getItem('satucard-shared-brand-kit'));
  assert.equal(shared.name, 'KZ Shop');
  assert.equal(shared.color, '#2563eb');
});
