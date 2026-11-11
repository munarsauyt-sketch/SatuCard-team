import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const source = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
async function setup({ fail = false, delayed = false } = {}) {
  const dom = new JSDOM(source('examples.html'), { url: 'https://satucard.test/examples.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window: w } = dom, renders = [], pending = [];
  w.eval(source('product-samples.js')); w.eval(source('assets/demo-images.js')); for (const key of ['ceramics', 'bag', 'jewelry', 'decor', 'kitchen']) w.eval(source(`assets/demo-${key}.js`));
  w.SATUCARD_RENDERER = { templates: Object.fromEntries(['studio', 'neon', 'editorial', 'bold', 'noir', 'bloom', 'accent', 'minimal', 'showcase', 'blueprint', 'matcha', 'pop', 'graphite', 'cloud'].map(key => [key, { label: key }])), render: (canvas, settings, assets) => renders.push({ canvas, settings, source: assets.photo.src }) };
  w.Image = class {
    set src(value) { this.value = value; const finish = () => fail ? this.onerror?.(new Error('unavailable')) : this.onload?.(); delayed ? pending.push(finish) : setTimeout(finish, 0); }
    get src() { return this.value; }
  };
  w.eval(source('marketing.js')); await tick();
  const cards = [...w.document.querySelectorAll('[data-template-item]')], select = w.document.querySelector('[data-demo-product]');
  const choose = async key => { select.value = key; select.dispatchEvent(new w.Event('change')); await tick(); };
  return { dom, w, cards, select, choose, renders, pending };
}
const keys = cards => cards.map(card => card.querySelector('canvas').dataset.photo);
function assertConsistent(app) {
  for (const card of app.cards) {
    const canvas = card.querySelector('canvas'), key = canvas.dataset.photo, sample = app.w.SATUCARD_SAMPLES[key];
    const link = card.querySelector('[data-editor-template]'), url = new URL(link.href);
    assert.equal(url.searchParams.get('photo'), key);
    assert.equal(url.searchParams.get('style'), canvas.dataset.template);
    assert.match(link.getAttribute('aria-label'), new RegExp(sample.title));
    assert.equal(card.querySelector('img').getAttribute('src'), `assets/images/${key}.jpg`);
    assert.equal(card.querySelector('img').alt, sample.title);
    assert.ok(card.querySelector('[data-product-label]').textContent.includes(sample.title));
    const last = app.renders.findLast(render => render.canvas === canvas);
    if (last) { assert.equal(last.settings.price, sample.price); assert.equal(last.settings.subtitle, sample.title); assert.equal(last.source, app.w.SATUCARD_DEMO_IMAGES[key]); }
  }
}

test('gallery compares fourteen styles on the same product and matching names, prices and links', async () => {
  const app = await setup();
  try {
    assert.equal(app.cards.length, 14); assert.equal(new Set(keys(app.cards)).size, 1); assert.equal(keys(app.cards).filter(key => key === 'headphones').length, 14);
    assert.equal(app.select.value, 'headphones'); assertConsistent(app);
    for (const [key, data] of Object.entries(app.w.SATUCARD_SAMPLES)) {
      assert.ok(data.title && data.price > 0);
      const bytes = readFileSync(new URL(`../assets/images/${key}.jpg`, import.meta.url));
      assert.equal(app.w.SATUCARD_DEMO_IMAGES[key], 'data:image/jpeg;base64,' + bytes.toString('base64'));
    }
  } finally { app.dom.window.close(); }
});

test('each product can be compared across all styles and mixed restores the original selection', async () => {
  const app = await setup();
  try {
    await app.choose('mixed'); const initial = keys(app.cards);
    for (const key of Object.keys(app.w.SATUCARD_SAMPLES)) { await app.choose(key); assert.deepEqual(keys(app.cards), Array(14).fill(key)); assertConsistent(app); }
    await app.choose('mixed'); assert.deepEqual(keys(app.cards), initial); assertConsistent(app);
    await app.choose('skincare'); await app.choose('mixed'); assert.deepEqual(keys(app.cards), initial);
  } finally { app.dom.window.close(); }
});

test('filters, current theme, invalid values and browser-restored selections stay consistent', async () => {
  const app = await setup();
  try {
    app.w.document.querySelector('[data-template-filter="dark"]').click();
    await app.choose('bag'); assert.equal(app.cards.filter(card => !card.hidden).length, 4);
    assert.match(app.w.document.querySelector('#catalog-status').textContent, /4 из 14/);
    app.w.document.documentElement.dataset.theme = 'dark';
    const link = app.cards[0].querySelector('a'); link.dispatchEvent(new app.w.MouseEvent('click', { cancelable: true }));
    assert.equal(new URL(link.href).searchParams.get('theme'), 'dark');
    app.select.value = 'jewelry'; app.w.dispatchEvent(new app.w.Event('pageshow')); await tick(); assert.deepEqual(keys(app.cards), Array(14).fill('jewelry')); assertConsistent(app);
    await app.choose('invalid'); assert.equal(app.select.value, 'mixed'); assert.equal(new Set(keys(app.cards)).size, 8);
    app.w.document.querySelector('[data-template-filter="all"]').click(); assert.equal(app.cards.filter(card => !card.hidden).length, 14);
  } finally { app.dom.window.close(); }
});

test('unavailable canvas photos retain the correct fallback and outgoing product link', async () => {
  const app = await setup({ fail: true });
  try { await app.choose('decor'); assertConsistent(app); assert.ok(app.cards.every(card => !card.querySelector('canvas').classList.contains('rendered'))); }
  finally { app.dom.window.close(); }
});

test('late image loads cannot paint an earlier product over the latest selection', async () => {
  const app = await setup({ delayed: true });
  try {
    await app.choose('bag'); await app.choose('skincare'); await app.choose('mixed');
    app.pending.reverse().forEach(finish => finish()); await tick(); assertConsistent(app);
  } finally { app.dom.window.close(); }
});
