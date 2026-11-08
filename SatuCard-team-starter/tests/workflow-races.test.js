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

test('local import does not overwrite edits made while file text is reading', async () => {
  const app = await setup();
  try {
    let resolveText;
    const payload = app.w.SATUCARD_EDITOR.snapshot(true).serialized;
    Object.defineProperty(app.$('load-project-input'), 'files', { configurable: true, value: [{ size: payload.length, text: () => new Promise(resolve => { resolveText = resolve; }) }] });
    app.$('load-project-input').dispatchEvent(new app.w.Event('change', { bubbles: true }));
    app.input('product-name', 'New work after file selection');
    resolveText(payload);
    await sleep(50);
    assert.equal(app.$('product-name').value, 'New work after file selection');
  } finally { app.dom.window.close(); }
});

test('a slower earlier local import cannot replace the later selected file', async () => {
  const app = await setup();
  try {
    let resolveFirst;
    const first = app.w.SATUCARD_EDITOR.snapshot(true).serialized;
    const second = JSON.parse(first);
    second.settings.title = 'Later file'; second.views[0].settings.title = 'Later file';
    const picker = app.$('load-project-input');
    Object.defineProperty(picker, 'files', { configurable: true, value: [{ size: first.length, text: () => new Promise(resolve => { resolveFirst = resolve; }) }] });
    picker.dispatchEvent(new app.w.Event('change', { bubbles: true }));
    Object.defineProperty(picker, 'files', { configurable: true, value: [{ size: first.length, text: async () => JSON.stringify(second) }] });
    picker.dispatchEvent(new app.w.Event('change', { bubbles: true }));
    await until(() => app.$('product-name').value === 'Later file');
    resolveFirst(first);
    await sleep(50);
    assert.equal(app.$('product-name').value, 'Later file');
  } finally { app.dom.window.close(); }
});

test('project restore rejects a photo drag started during image decoding', async () => {
  const app = await setup({ imageDelay: 20 });
  try {
    await sleep(30);
    const editor = app.w.SATUCARD_EDITOR, initial = editor.snapshot(true);
    const canvas = app.$('product-canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900 });
    canvas.setPointerCapture = () => {};
    const { photoRect } = app.w.SATUCARD_RENDERER.render(canvas, initial.model.settings, initial.images);
    const x = photoRect.x + photoRect.width / 2, y = photoRect.y + photoRect.height / 2;
    const point = (type, clientX) => {
      const event = new app.w.Event(type);
      Object.assign(event, { pointerId: 1, button: 0, clientX, clientY: y });
      canvas.dispatchEvent(event);
    };
    const restore = editor.restoreProject(initial.serialized, editor.revision);
    point('pointerdown', x); point('pointermove', x + 100);
    const draggedX = editor.snapshot().model.settings.photo.x;
    await assert.rejects(restore, /изменился/);
    assert.equal(editor.snapshot().model.settings.photo.x, draggedX);
    point('pointerup', x + 100);
  } finally { app.dom.window.close(); }
});
