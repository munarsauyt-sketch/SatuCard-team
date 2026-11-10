import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { validateProject } from '../lib/projects.js';

// DOM integration with deterministic raster/network stubs. This does not replace
// real-browser visual QA or a deployed Supabase/OpenAI acceptance test.
const files = ['assets/demo-images.js', 'assets/demo-ceramics.js', 'assets/demo-bag.js', 'assets/demo-jewelry.js', 'assets/demo-decor.js', 'assets/demo-kitchen.js',  'product-samples.js', 'studio-renderer.js', 'studio-project.js', 'studio-tools.js', 'studio-copy.js', 'cloud-projects.js', 'editor.js', 'studio-workflow.js'];
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWuoAAAAASUVORK5CYII=';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) { for (let i = 0; i < 80; i++) { if (predicate()) return; await sleep(5); } throw new Error('UI did not settle'); }
async function setup(options = {}) {
  const dom = new JSDOM(readFileSync(new URL('../editor.html', import.meta.url), 'utf8'), { url: options.url || 'https://satucard.test/editor.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window: w } = dom;
  const context = new Proxy({ measureText: text => ({ width: String(text).length * 12 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: () => { const data = new Uint8ClampedArray(10 * 10 * 4).fill(255); for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) { const offset = (y * 10 + x) * 4; data[offset] = 20; data[offset + 1] = 40; data[offset + 2] = 70; } return { data, width: 10, height: 10 }; } }, { get: (obj, key) => key in obj ? obj[key] : () => {} });
  w.HTMLCanvasElement.prototype.getContext = () => context;
  w.HTMLCanvasElement.prototype.toDataURL = function(type, quality) { options.raster?.({width:this.width,height:this.height,type,quality}); return type === 'image/jpeg' ? 'data:image/jpeg;base64,/9j/AA==' : png; };
  w.HTMLCanvasElement.prototype.toBlob = function (callback, type) { callback(new Blob(['test raster'], { type })); };
  w.Image = class { naturalWidth = 10; naturalHeight = 10; set src(value) { this.value = value; setTimeout(() => this.onload?.(), options.imageDelay || 0); } };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const downloads = [];
  w.Blob = Blob; w.TextEncoder = TextEncoder; w.Uint8Array = Uint8Array; w.Uint8ClampedArray = Uint8ClampedArray; w.AbortController = AbortController; w.AbortSignal = AbortSignal;
  w.URL.createObjectURL = blob => { downloads.push(blob); return 'blob:test'; }; w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};
  w.fetch = options.fetch || (async () => Response.json({ available: false }));
  let userId = '11111111-1111-4111-8111-111111111111';
  w.SATUCARD_AUTH = { getSession: async () => ({ user: { id: userId }, access_token: 'fake-token' }) };
  const authChange = id => { userId = id; w.document.dispatchEvent(new w.CustomEvent('satucard:authchange', { detail: { user: id ? { id } : null } })); };
  for (const file of files) w.eval(readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
  await until(() => w.document.getElementById('editor-form').dataset.editorReady === 'true');
  const $ = id => w.document.getElementById(id);
  const input = (id, value) => { $(id).value = value; $(id).dispatchEvent(new w.Event('input', { bubbles: true })); $(id).dispatchEvent(new w.Event('change', { bubbles: true })); };
  return { dom, w, $, input, downloads, authChange };
}


const draft = { title: 'Terra title', subtitle: 'Subtitle', description: 'Cotton', features: ['Cotton', 'M', 'Blue'], template: 'studio', source: 'ai' };
async function aiApp(options = {}) {
  const requests = [];
  const app = await setup({ ...options, fetch: async (url, init = {}) => {
    if (!init.method) return Response.json({ available: true, hasAccess: true, adminOnly: true });
    requests.push(JSON.parse(init.body)); return options.reply ? options.reply(init) : Response.json(draft);
  } });
  await until(() => !app.$('copy-ai').disabled);
  app.input('copy-facts', 'Material: cotton\nSize: M');
  return { ...app, requests };
}
function check(app, id, value = true) { app.$(id).checked = value; app.$(id).dispatchEvent(new app.w.Event('input', { bubbles: true })); }
async function generate(app) { app.$('copy-ai').click(); await until(() => !app.$('copy-result').hidden); }

test('AI sends text only by default, requires renewed seller review, and applies template/text in one undo', async () => {
  const app = await aiApp(); const { $, w } = app;
  try {
    const before = w.SATUCARD_EDITOR.snapshot().model.settings;
    await generate(app);
    assert.equal(app.requests[0].imageDataUrl, undefined);
    assert.equal($('copy-photo').checked, false); assert.equal($('copy-apply-template').checked, false);
    assert.equal($('copy-template').options.length, 8); assert.equal($('copy-apply').disabled, true);
    $('copy-apply').click(); assert.equal($('product-name').value, before.title);
    check(app, 'copy-reviewed'); app.input('copy-edit-title', 'Reviewed title'); assert.equal($('copy-reviewed').checked, false);
    check(app, 'copy-apply-template'); check(app, 'copy-reviewed'); $('copy-apply').click();
    const after = w.SATUCARD_EDITOR.snapshot().model.settings;
    assert.equal(after.title, 'Reviewed title'); assert.equal(after.template, 'studio'); assert.equal(after.background, before.background);
    $('undo-button').click(); const undone = w.SATUCARD_EDITOR.snapshot().model.settings;
    assert.equal(undone.title, before.title); assert.equal(undone.template, before.template);
  } finally { app.dom.window.close(); }
});
test('photo consent sends only a resized JPEG and offline never sends even with consent', async () => {
  const rasters = []; const app = await aiApp({ raster: value => rasters.push(value) });
  try {
    const photo = app.w.SATUCARD_EDITOR.snapshot().images.photo; photo.naturalWidth = 2400; photo.naturalHeight = 1200;
    check(app, 'copy-photo'); await generate(app);
    assert.match(app.requests[0].imageDataUrl, /^data:image\/jpeg;base64,/);
    assert.deepEqual(rasters.at(-1), { width:768,height:384,type:'image/jpeg',quality:0.8 });
    app.$('copy-dismiss').click(); app.$('copy-offline').click(); assert.equal(app.requests.length, 1); assert.equal(app.$('copy-apply').disabled, false);
  } finally { app.dom.window.close(); }
});
test('text-only application leaves template unchanged; palette replacement is explicit', async () => {
  const app = await aiApp();
  try {
    const before = app.w.SATUCARD_EDITOR.snapshot().model.settings;
    await generate(app); check(app, 'copy-reviewed'); app.$('copy-apply').click();
    assert.equal(app.w.SATUCARD_EDITOR.snapshot().model.settings.template, before.template);
    await generate(app); check(app, 'copy-apply-template'); check(app, 'copy-template-colors'); check(app, 'copy-reviewed'); app.$('copy-apply').click();
    const after = app.w.SATUCARD_EDITOR.snapshot().model.settings;
    assert.equal(after.background, app.w.SATUCARD_RENDERER.templates.studio.background); assert.equal(after.customColors, false);
  } finally { app.dom.window.close(); }
});
test('cancelled response cannot overwrite a newer request and double clicks do not duplicate requests', async () => {
  const pending = []; const app = await aiApp({reply: () => new Promise(resolve => pending.push(resolve))});
  try {
    app.$('copy-ai').click(); app.$('copy-ai').click(); await until(() => pending.length === 1); assert.equal(app.requests.length, 1);
    app.$('copy-cancel').click(); assert.match(app.$('copy-status').textContent, /Уже отправленный запрос может учитываться в лимите/); app.$('copy-ai').click(); await until(() => pending.length === 2);
    pending[1](Response.json({...draft,title:'New request'})); await until(() => !app.$('copy-result').hidden);
    pending[0](Response.json({...draft,title:'Old request'})); await sleep(20); assert.equal(app.$('copy-edit-title').value,'New request');
  } finally { app.dom.window.close(); }
});
for (const change of ['edit','photo','view','auth','close']) test(`AI draft is rejected after ${change}`, async () => {
  let resolve; const app = await aiApp({reply: () => new Promise(done => {resolve=done;})});
  try {
    app.$('copy-ai').click(); await until(() => !!resolve);
    if (change === 'edit') app.input('product-name', 'New text');
    if (change === 'photo') app.$('photo-input').dispatchEvent(new app.w.Event('change'));
    if (change === 'view') app.$('add-view').click();
    if (change === 'auth') app.authChange(null);
    if (change === 'close') app.$('copy-dismiss').click();
    resolve(Response.json(draft)); await sleep(20); assert.equal(app.$('copy-result').hidden,true); assert.equal(app.$('copy-reviewed').checked,false);
  } finally { app.dom.window.close(); }
});
test('server errors leave manual and offline editing usable', async () => {
  const app = await aiApp({reply: async () => Response.json({error:'Unavailable'}, {status:503})});
  try {
    app.$('copy-ai').click(); await until(() => /Unavailable/.test(app.$('copy-status').textContent));
    assert.equal(app.$('copy-result').hidden,true); app.$('copy-offline').click(); assert.equal(app.$('copy-result').hidden,false);
  } finally { app.dom.window.close(); }
});

test('AI timeout is 35 seconds and never applies a late response', async () => {
  let expire, signal;
  const app = await aiApp({reply: init => { signal = init.signal; return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))); }});
  try {
    const original = app.w.setTimeout;
    app.w.setTimeout = (callback, delay, ...args) => { if (delay === 35000) { expire = callback; return 999; } return original(callback, delay, ...args); };
    app.$('copy-ai').click(); await until(() => !!signal); assert.ok(expire); expire();
    await until(() => /вовремя/.test(app.$('copy-status').textContent));
    assert.equal(signal.aborted, true); assert.equal(app.$('copy-result').hidden, true); assert.equal(app.$('copy-offline').disabled, false);
  } finally { app.dom.window.close(); }
});
test('invalid AI template fails closed rather than rendering an unknown layout', async () => {
  const app = await aiApp({reply: async () => Response.json({...draft, template:'invented'})});
  try {
    app.$('copy-ai').click(); await until(() => /Некорректный/.test(app.$('copy-status').textContent));
    assert.equal(app.$('copy-result').hidden,true);
  } finally { app.dom.window.close(); }
});

for (const navigation of ['accordion-collapse', 'pagehide']) test(`${navigation} aborts pending AI and invalidates reviewed drafts`, async () => {
  let resolve, signal, delayed = true;
  const app = await aiApp({reply: init => { signal = init.signal; return delayed ? new Promise(done => { resolve = done; }) : Response.json(draft); }});
  const accordion = app.$('copy-facts').closest('details');
  async function open() { accordion.open = true; await sleep(10); }
  async function navigate() {
    if (navigation === 'accordion-collapse') { accordion.open = false; await sleep(10); }
    else app.w.dispatchEvent(new app.w.Event('pagehide'));
  }
  try {
    await open(); app.$('copy-ai').click(); await until(() => !!resolve);
    await navigate(); assert.equal(signal.aborted, true);
    resolve(Response.json(draft)); await sleep(20); assert.equal(app.$('copy-result').hidden, true);
    delayed = false; await open(); await generate(app); check(app, 'copy-reviewed');
    assert.equal(app.$('copy-reviewed').checked, true);
    await navigate(); assert.equal(app.$('copy-result').hidden, true); assert.equal(app.$('copy-reviewed').checked, false);
    const title = app.$('product-name').value; app.$('copy-apply').click(); assert.equal(app.$('product-name').value, title);
  } finally { app.dom.window.close(); }
});


for (const boundary of ['view', 'account', 'replace-photo', 'upload', 'import', 'reset', 'restore', 'pagehide']) test(`photo consent is revoked at ${boundary} boundary`, async () => {
  const app = await aiApp();
  try {
    check(app, 'copy-photo'); assert.equal(app.$('copy-photo').checked, true);
    if (boundary === 'view') app.$('add-view').click();
    if (boundary === 'account') app.authChange(null);
    if (boundary === 'replace-photo') await app.w.SATUCARD_EDITOR.replacePhoto(png, app.w.SATUCARD_EDITOR.revision);
    if (boundary === 'upload') app.$('photo-input').dispatchEvent(new app.w.Event('change'));
    if (boundary === 'import') app.$('load-project-input').dispatchEvent(new app.w.Event('change'));
    if (boundary === 'reset') app.$('reset-button').click();
    if (boundary === 'restore') app.$('restore-draft-button').click();
    if (boundary === 'pagehide') app.w.dispatchEvent(new app.w.Event('pagehide'));
    assert.equal(app.$('copy-photo').checked, false); assert.equal(app.requests.length, 0);
    await sleep(20);
  } finally { app.dom.window.close(); }
});
