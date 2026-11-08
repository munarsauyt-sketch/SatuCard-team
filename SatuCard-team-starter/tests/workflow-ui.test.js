import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { validateProject } from '../lib/projects.js';

// DOM integration with deterministic raster/network stubs. This does not replace
// real-browser visual QA or a deployed Supabase/OpenAI acceptance test.
const files = ['assets/demo-images.js', 'studio-renderer.js', 'studio-project.js', 'studio-tools.js', 'studio-copy.js', 'cloud-projects.js', 'editor.js', 'studio-workflow.js'];
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWuoAAAAASUVORK5CYII=';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) { for (let i = 0; i < 80; i++) { if (predicate()) return; await sleep(5); } throw new Error('UI did not settle'); }
async function setup(options = {}) {
  const dom = new JSDOM(readFileSync(new URL('../editor.html', import.meta.url), 'utf8'), { url: 'https://satucard.test/editor.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window: w } = dom;
  const context = new Proxy({ measureText: text => ({ width: String(text).length * 12 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: () => { const data = new Uint8ClampedArray(10 * 10 * 4).fill(255); for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) { const offset = (y * 10 + x) * 4; data[offset] = 20; data[offset + 1] = 40; data[offset + 2] = 70; } return { data, width: 10, height: 10 }; } }, { get: (obj, key) => key in obj ? obj[key] : () => {} });
  w.HTMLCanvasElement.prototype.getContext = () => context;
  w.HTMLCanvasElement.prototype.toDataURL = () => png;
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

test('set creation, independent edits, undo/redo and portable restore work through DOM', async () => {
  const app = await setup(); const { w, $, input } = app;
  try {
    $('make-set').click(); assert.equal($('product-views').children.length, 3);
    $('product-views').children[1].click(); input('product-name', 'Екінші карточка');
    $('product-views').children[0].click(); assert.equal($('product-name').value, 'Беспроводные наушники');
    $('product-views').children[1].click(); assert.equal($('product-name').value, 'Екінші карточка');
    const saved = w.SATUCARD_EDITOR.snapshot(true).serialized;
    assert.doesNotThrow(() => validateProject(JSON.parse(saved)), "actual editor output accepted by cloud API");
    $('remove-view').click(); assert.equal($('product-views').children.length, 2);
    $('undo-button').click(); assert.equal($('product-views').children.length, 3);
    $('redo-button').click(); assert.equal($('product-views').children.length, 2);
    await w.SATUCARD_EDITOR.restoreProject(saved); assert.equal($('product-views').children.length, 3); assert.equal($('product-name').value, 'Екінші карточка');
    $('reset-button').click(); assert.equal($('product-views').children.length, 1);
  } finally { app.dom.window.close(); }
});

test('copy previews are explicit, cancelable and cannot overwrite newer fields or helper inputs', async () => {
  const app = await setup(); const { $, input } = app;
  try {
    input('copy-facts', 'Материал: хлопок\nРазмер: M'); $('copy-offline').click();
    assert.equal($('copy-result').hidden, false); assert.match($('copy-preview').textContent, /хлопок/);
    const previous = $('product-description').value; input('copy-language', 'kk'); assert.equal($('copy-result').hidden, true);
    $('copy-offline').click(); assert.match($('copy-preview').textContent, /Тауар/);
    input('product-subtitle', 'Новые правки'); $('copy-apply').click(); assert.equal($('product-description').value, previous); assert.match($('copy-status').textContent, /изменилась/);
    $('copy-offline').click(); $('copy-apply').click(); assert.match($('product-description').value, /хлопок/);
    $('undo-button').click(); assert.equal($('product-description').value, previous);
    $('copy-offline').click(); $('copy-dismiss').click(); assert.equal($('copy-result').hidden, true);
  } finally { app.dom.window.close(); }
});

test('cloud save survives same-account refresh, conflicts are safe, and undo detaches identity', async () => {
  let app, writes = [], conflict = false, refreshOnSave = false;
  app = await setup({ fetch: async (url, init = {}) => {
    if (url === 'api/copy') return Response.json({ available: false });
    if (init.method === 'POST') {
      const body = JSON.parse(init.body); writes.push(body);
      if (refreshOnSave) app.authChange('11111111-1111-4111-8111-111111111111');
      return conflict ? Response.json({ error: 'Conflict', code: 'version_conflict' }, { status: 409 }) : Response.json({ project: { id: '22222222-2222-4222-8222-222222222222', title: body.title, version: (body.version || 0) + 1 } });
    }
    return Response.json({ projects: [] });
  } });
  try {
    refreshOnSave = true; app.$('cloud-save').click(); await until(() => !app.$('cloud-save').disabled);
    app.input('product-name', 'Changed'); app.$('cloud-save').click(); await until(() => !app.$('cloud-save').disabled);
    assert.equal(writes[1].id, '22222222-2222-4222-8222-222222222222'); assert.equal(writes[1].version, 1);
    conflict = true; app.$('cloud-save').click(); await until(() => !app.$('cloud-save').disabled); assert.match(app.$('cloud-status').textContent, /другом устройстве/);
    conflict = false; app.$('undo-button').click(); app.$('cloud-save').click(); await until(() => !app.$('cloud-save').disabled); assert.equal(writes.at(-1).id, undefined);
  } finally { app.dom.window.close(); }
});

test('stale cloud load cannot overwrite an edited project or changed account', async () => {
  let resolveRead;
  const app = await setup({ imageDelay: 10, fetch: async (url) => {
    if (url === 'api/copy') return Response.json({ available: false });
    if (url.includes('?id=')) return new Promise(resolve => { resolveRead = resolve; });
    return Response.json({ projects: [{ id: '22222222-2222-4222-8222-222222222222', title: 'Cloud', updatedAt: '2026-11-08', version: 1 }] });
  } });
  try {
    app.$('cloud-refresh').click(); await until(() => !app.$('cloud-refresh').disabled);
    app.$('cloud-project-list').querySelector('button').click(); await until(() => Boolean(resolveRead));
    const payload = JSON.parse(app.w.SATUCARD_EDITOR.snapshot(true).serialized); payload.settings.title = 'Remote'; payload.views[0].settings.title = 'Remote';
    resolveRead(Response.json({ project: { id: '22222222-2222-4222-8222-222222222222', title: 'Cloud', version: 1, payload } }));
    await sleep(2); app.authChange('33333333-3333-4333-8333-333333333333');
    await until(() => !app.$('cloud-refresh').disabled); assert.notEqual(app.$('product-name').value, 'Remote'); assert.equal(app.$('cloud-project-list').children.length, 0);
  } finally { app.dom.window.close(); }
});

test('ZIP includes every view and report; preflight and background tools are reachable', async () => {
  const app = await setup();
  try {
    app.$('make-set').click(); app.$('download-set').click(); await until(() => !app.$('download-set').disabled);
    assert.ok(app.downloads.at(-1), app.$('set-status').textContent); assert.equal(app.downloads.at(-1).type, 'application/zip');
    const bytes = new Uint8Array(await app.downloads.at(-1).arrayBuffer());
    assert.equal(new DataView(bytes.buffer).getUint16(bytes.length - 12, true), 4, '3 images + report');
    app.$('check-export').click(); await until(() => !app.$('check-export').disabled); assert.ok(app.$('preflight-results').children.length >= 5);
    const before = app.w.SATUCARD_EDITOR.snapshot().model.photoId;
    app.$('remove-background').click(); await until(() => !app.$('remove-background').disabled); assert.notEqual(app.w.SATUCARD_EDITOR.snapshot().model.photoId, before);
    app.$('undo-button').click(); assert.equal(app.w.SATUCARD_EDITOR.snapshot().model.photoId, before);
  } finally { app.dom.window.close(); }
});
