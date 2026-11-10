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

test('free editing can paste a photo, make a format copy and export WebP or clipboard PNG', async () => {
  const app = await setup();
  const { w, $, input } = app;
  try {
    const pngFile = new w.File([w.atob(png.split(',')[1])], 'paste.png', { type: 'image/png' });
    const paste = () => {
      const event = new w.Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { files: [pngFile] } });
      return event;
    };
    const textPaste = paste();
    $('product-name').dispatchEvent(textPaste);
    assert.equal(textPaste.defaultPrevented, false);
    const imagePaste = paste();
    w.document.body.dispatchEvent(imagePaste);
    assert.equal(imagePaste.defaultPrevented, true);
    await until(() => $('file-status').textContent.includes('Фото загружено.'));
    input('product-name', 'Мой товар');
    input('photo-warmth', '25');
    input('photo-blur', '3');
    input('duplicate-format', 'story');
    const copy = w.SATUCARD_EDITOR.snapshot().model;
    assert.deepEqual(Array.from(copy.views, view => view.settings.format), ['portrait', 'story']);
    assert.equal(copy.settings.photo.warmth, 25);
    assert.equal(copy.settings.photo.blur, 3);
    $('undo-button').click();
    assert.equal(w.SATUCARD_EDITOR.snapshot().model.views.length, 1);
    assert.equal($('card-format').value, 'portrait');
    $('photo-palette').click();
    const palette = w.SATUCARD_EDITOR.snapshot().model.settings;
    assert.equal(palette.customColors, true);
    assert.match(palette.background, /^#[0-9a-f]{6}$/);
    assert.notEqual(palette.background, palette.accent);
    $('undo-button').click();
    assert.equal($('custom-colors').checked, false);

    input('export-format', 'webp');
    $('download-button').click();
    await until(() => !($('download-button').disabled));
    $('export-review-download').click();
    assert.equal(app.downloads.at(-1).type, 'image/webp');
    assert.match($('download-status').textContent, /[1-9]\d* КБ/);
    $('download-set').click();
    await until(() => !($('download-set').disabled));
    $('export-review-download').click();
    const archive = new TextDecoder().decode(await app.downloads.at(-1).arrayBuffer());
    assert.match(archive, /\.webp/);

    let copied;
    w.ClipboardItem = class { constructor(items) { this.items = items; } };
    Object.defineProperty(w.navigator, 'clipboard', { value: { write: async ([item]) => { copied = await item.items['image/png']; } } });
    $('copy-card-image').click();
    await until(() => !($('copy-card-image').disabled));
    assert.equal(copied.type, 'image/png');
  } finally { app.dom.window.close(); }
});

test('all four tool sections remain reachable with the keyboard', async () => {
  const app = await setup();
  const { $, w } = app;
  try {
    $('tab-photo').focus();
    $('tab-photo').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    assert.equal($('tab-templates').getAttribute('aria-selected'), 'true');
    assert.equal($('panel-templates').hidden, false);
    assert.equal(w.document.activeElement, $('tab-templates'));
    $('tab-templates').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal($('tab-photo').getAttribute('aria-selected'), 'true');
    assert.equal($('panel-templates').hidden, true);
    assert.equal($('template-grid').closest('[data-editor-panel]').id, 'panel-templates');
  } finally { app.dom.window.close(); }
});

test('export opens the needed field when the canvas is in focus mode', async () => {
  const app = await setup();
  const { $, input, dom } = app;
  try {
    input('product-name', '');
    $('canvas-focus-mode').click();
    $('download-button').click();
    assert.equal($('canvas-focus-mode').getAttribute('aria-pressed'), 'false');
    assert.equal($('panel-content').hidden, false);
    assert.equal(dom.window.document.activeElement, $('product-name'));

    input('product-name', 'Чашка');
    input('old-price', 'не цена');
    $('canvas-focus-mode').click();
    $('download-button').click();
    assert.equal($('canvas-focus-mode').getAttribute('aria-pressed'), 'false');
    assert.equal(dom.window.document.activeElement, $('old-price'));
  } finally { dom.window.close(); }
});

test('export warns before downloading and can return to the demo field or continue once', async () => {
  const app = await setup();
  const { $, input, w, downloads } = app;
  try {
    $('canvas-focus-mode').click();
    $('download-button').click();
    await until(() => $('export-review').open);
    assert.equal(downloads.length, 0);
    const description = [...$('export-review-results').querySelectorAll('button')]
      .find(button => button.getAttribute('aria-label').includes('«Описание»'));
    description.click();
    assert.equal($('export-review').open, false);
    assert.equal(w.document.activeElement, $('product-description'));

    input('product-description', 'Материал корпуса: металл.');
    $('download-button').click();
    await until(() => $('export-review').open);
    assert.doesNotMatch($('export-review-results').textContent, /«Описание» осталось из примера/);
    input('export-format', 'webp');
    assert.equal($('export-review').open, false);
    $('export-review-download').click();
    assert.equal(downloads.length, 0, 'a changed format discards the prepared file');

    $('download-button').click();
    await until(() => $('export-review').open);
    $('export-review-download').click();
    $('export-review-download').click();
    assert.deepEqual(downloads.map(file => file.type), ['image/webp']);
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
    assert.equal(app.downloads.length, 0);
    assert.equal(app.$('export-review').open, true);
    assert.match(app.$('export-review-results').textContent, /Преимущества · /);
    app.$('export-review-download').click();
    assert.equal(app.downloads.at(-1).type, 'application/zip');
    const bytes = new Uint8Array(await app.downloads.at(-1).arrayBuffer());
    assert.equal(new DataView(bytes.buffer).getUint16(bytes.length - 12, true), 4, '3 images + report');
    app.$('check-export').click(); await until(() => !app.$('check-export').disabled); assert.ok(app.$('preflight-results').children.length >= 5);
    const before = app.w.SATUCARD_EDITOR.snapshot().model.photoId;
    app.$('remove-background').click(); await until(() => !app.$('remove-background').disabled); assert.notEqual(app.w.SATUCARD_EDITOR.snapshot().model.photoId, before);
    app.$('undo-button').click(); assert.equal(app.w.SATUCARD_EDITOR.snapshot().model.photoId, before);
  } finally { app.dom.window.close(); }
});

test('the assistant opens the local report and a title warning focuses the editor field', async () => {
  const requests = [];
  const app = await setup({ fetch: async url => { requests.push(url); return Response.json({ available: false }); } });
  const { w, $, input } = app;
  try {
    input('product-name', '');
    const previousRequests = requests.length;
    $('ai-check-card').click();
    await until(() => !$('check-export').disabled);
    assert.equal(requests.length, previousRequests);
    assert.equal($('preflight-panel').open, true);
    assert.equal(w.document.activeElement, $('preflight-status'));
    assert.match($('preflight-status').textContent, /Есть ошибки/);
    const fixTitle = [...$('preflight-results').querySelectorAll('button')].find(button => button.textContent === 'Перейти к заголовку');
    assert.equal(fixTitle.textContent, 'Перейти к заголовку');
    fixTitle.click();
    assert.equal($('tab-content').getAttribute('aria-selected'), 'true');
    assert.equal(w.document.activeElement, $('product-name'));
    input('product-name', 'Чашка');
    assert.equal($('preflight-results').children.length, 0);
  } finally { app.dom.window.close(); }
});

test('three-photo selection is per card, ordered, undoable and portable', async () => {
  const app = await setup(); const { w, $, input } = app;
  try {
    const editor = w.SATUCARD_EDITOR, payload = JSON.parse(editor.snapshot(true).serialized);
    payload.photos.push({ id: 'second', source: png }, { id: 'third', source: png });
    payload.views[0].photoIds = payload.photos.map(photo => photo.id);
    payload.views.push({ id: 'other', label: 'Другое фото', settings: { ...payload.settings, title: 'Другая карточка' }, photoIds: ['third'] });
    await editor.restoreProject(JSON.stringify(payload));
    assert.equal($('photo-library').children.length, 3); assert.equal($('selected-photos').children.length, 3);
    let current = editor.snapshot(); const originalIds = [...current.model.photoIds];
    $('selected-photos').children[1].querySelector('button').click();
    assert.equal(editor.snapshot().model.photoId, originalIds[1]);
    $('undo-button').click(); assert.equal(editor.snapshot().model.photoId, originalIds[0]);
    $('redo-button').click(); assert.equal(editor.snapshot().model.photoId, originalIds[1]);
    $('product-views').children[1].click(); assert.equal(editor.snapshot().images.photos.length, 1); assert.equal(editor.snapshot().model.photoId, originalIds[2]);
    $('product-views').children[0].click(); assert.equal(editor.snapshot().images.photos.length, 3);
    $('photo-library').children[0].querySelector('.photo-choice').click(); assert.equal(editor.snapshot().images.photos.length, 2);
    const saved = editor.snapshot(true).serialized; assert.doesNotThrow(() => validateProject(JSON.parse(saved)));
    await editor.restoreProject(saved); assert.equal(editor.snapshot().images.photos.length, 2);
    input('card-purpose', 'contents'); input('card-format', 'portrait34');
    const after = JSON.parse(editor.snapshot(true).serialized); assert.equal(after.settings.format, 'portrait34'); assert.equal(after.settings.purpose, 'contents');
    assert.doesNotThrow(() => validateProject(after));
    // Global removal is reflected in every view; undo restores references and assets.
    $('photo-library').lastElementChild.querySelector('.photo-delete').click();
    assert.equal(editor.snapshot().model.libraryIds.length, 2);
    $('product-views').children[1].click(); assert.equal(editor.snapshot().images.photos.length, 0);
    $('undo-button').click(); $('undo-button').click(); assert.equal(editor.snapshot().model.libraryIds.length, 3);
  } finally { app.dom.window.close(); }
});

test('card thumbnails reorder ZIP and brand application preserves content and purpose', async () => {
  const app = await setup(); const { w, $, input } = app;
  try {
    $('make-set').click(); const editor = w.SATUCARD_EDITOR;
    assert.ok($('product-views').querySelector('canvas')); assert.equal(editor.snapshot().model.views[1].settings.purpose, 'advantages');
    $('product-views').children[1].click(); const active = editor.snapshot().model.activeViewId;
    input('brand-name', 'Aru Store'); input('product-category', 'clothing');
    $('view-earlier').click(); assert.equal(editor.snapshot().model.views[0].id, active); assert.equal($('view-earlier').disabled, true);
    $('apply-brand').click();
    const views = editor.snapshot().model.views;
    assert.ok(views.every(view => view.settings.brandName === 'Aru Store' && view.settings.customColors));
    assert.equal(views[0].settings.purpose, 'advantages'); assert.equal(views[1].settings.purpose, 'cover');
    $('download-set').click(); await until(() => !$('download-set').disabled);
    $('export-review-download').click();
    const bytes = new Uint8Array(await app.downloads.at(-1).arrayBuffer()); const nameLength = new DataView(bytes.buffer).getUint16(26, true);
    assert.equal(new TextDecoder().decode(bytes.slice(30, 30 + nameLength)), '01-Преимущества.png');
    $('undo-button').click(); assert.notEqual(editor.snapshot().model.views[1].settings.brandName, 'Aru Store');
  } finally { app.dom.window.close(); }
});

test('edited Kazakh copy applies only after explicit approval and phone dialog can reopen', async () => {
  const app = await setup(); const { $, input } = app;
  try {
    input('copy-facts', 'Материал: мақта\nӨлшем: M'); input('copy-language', 'kk'); $('copy-offline').click();
    input('copy-edit-title', 'Өзім өңдеген атау'); input('copy-edit-feature-1', 'Мақтадан жасалған');
    assert.notEqual($('product-name').value, 'Өзім өңдеген атау'); $('copy-apply').click();
    assert.equal($('product-name').value, 'Өзім өңдеген атау'); assert.equal($('feature-1').value, 'Мақтадан жасалған');
    input('card-format', 'portrait34'); $('phone-preview-button').click();
    assert.equal($('phone-dialog').open, true); assert.equal($('phone-canvas').height, 1200);
    $('phone-close').click(); assert.equal($('phone-dialog').open, false);
    $('phone-preview-button').click(); assert.equal($('phone-dialog').open, true); $('phone-close').click();
  } finally { app.dom.window.close(); }
});

test('photo batch upload respects file limit and switching cards cancels stale images', async () => {
  const app = await setup({ imageDelay: 15 }); const { w, $ } = app;
  try {
    const picker = $('photo-input');
    const choose = files => { Object.defineProperty(picker, 'files', { configurable: true, value: files }); picker.dispatchEvent(new w.Event('change', { bubbles: true })); };
    const photo = name => new w.File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
    choose([photo('a.png'), photo('b.png')]); await until(() => w.SATUCARD_EDITOR.snapshot().model.libraryIds.length === 3);
    assert.equal(w.SATUCARD_EDITOR.snapshot().images.photos.length, 2, 'real photos replace the selected demo');
    assert.ok(w.SATUCARD_EDITOR.snapshot().model.photoIds.every(id => !id.startsWith('sample-')));
    const before = w.SATUCARD_EDITOR.snapshot(true).serialized;
    choose(Array.from({ length: 10 }, (_, i) => photo(`${i}.png`))); assert.match($('file-status').textContent, /до 12/);
    assert.equal(w.SATUCARD_EDITOR.snapshot(true).serialized, before);
    $('make-set').click(); choose([photo('late.png')]); $('product-views').children[1].click(); await sleep(80);
    assert.equal(w.SATUCARD_EDITOR.snapshot().model.libraryIds.length, 3);
  } finally { app.dom.window.close(); }
});

test('a real product drops untouched demo content, preserves edits, and stays blank after reopening', async () => {
  const app = await setup(); const { w, $, input } = app;
  try {
    const editor = w.SATUCARD_EDITOR, sample = editor.snapshot();
    input('brand-name', 'Aru Store');
    input('feature-2', 'Мой подтверждённый факт');
    input('card-format', 'square');
    const choose = name => {
      const file = new w.File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
      Object.defineProperty($('photo-input'), 'files', { configurable: true, value: [file] });
      $('photo-input').dispatchEvent(new w.Event('change', { bubbles: true }));
    };
    choose('product.png');
    await until(() => editor.snapshot().model.libraryIds.length === 2);
    const real = editor.snapshot(true);
    assert.notEqual(real.productContextId, sample.productContextId);
    assert.equal(real.sampleKey, null);
    assert.equal($('product-name').value, '');
    assert.equal($('product-description').value, '');
    assert.equal($('product-badge').value, '');
    assert.equal($('product-price').value, '');
    assert.deepEqual(Array.from(real.model.settings.features), ['Мой подтверждённый факт']);
    assert.equal(real.model.settings.brandName, 'Aru Store');
    assert.equal(real.model.settings.format, 'square');
    assert.equal(real.images.photos.length, 1);

    $('undo-button').click();
    assert.equal(editor.snapshot().productContextId, sample.productContextId);
    assert.equal($('product-name').value, 'Беспроводные наушники');
    $('redo-button').click();
    assert.equal(editor.snapshot().productContextId, real.productContextId);
    choose('detail.png');
    await until(() => editor.snapshot().images.photos.length === 2);
    assert.equal(editor.snapshot().productContextId, real.productContextId);
    assert.equal(JSON.parse(real.serialized).settings.title, '');
    assert.doesNotThrow(() => validateProject(JSON.parse(real.serialized)));
    await editor.restoreProject(real.serialized);
    assert.equal(editor.snapshot().model.activeViewId, real.model.activeViewId);
    assert.notEqual(editor.snapshot().productContextId, real.productContextId);
    assert.equal($('product-name').value, '');
  } finally { app.dom.window.close(); }
});

test('selective copy and a translated duplicate preserve original fields, assets, and undo', async () => {
  const app = await setup(); const { w, $ } = app;
  try {
    const editor = w.SATUCARD_EDITOR, original = editor.snapshot();
    const draft = { title: 'Құлаққап', subtitle: 'Қысқа тақырып', description: 'Расталған сипаттама', features: ['Ыңғайлы'] };
    editor.applyCopy(draft, editor.revision, { fields: ['description'] });
    assert.equal($('product-description').value, draft.description);
    assert.equal($('product-name').value, original.model.settings.title);
    assert.equal($('product-subtitle').value, original.model.settings.subtitle);
    assert.equal($('feature-1').value, original.model.settings.features[0]);

    const beforeTranslation = editor.snapshot();
    editor.applyCopy(draft, editor.revision, { fields: ['title', 'subtitle'], duplicate: true });
    const translated = editor.snapshot(true);
    assert.equal(translated.model.views.length, 2);
    assert.match(translated.model.views[1].label, /Қазақша$/);
    assert.equal(translated.model.settings.title, draft.title);
    assert.equal(translated.model.settings.description, draft.description);
    assert.equal(translated.model.settings.price, beforeTranslation.model.settings.price);
    assert.equal(translated.model.settings.brandName, beforeTranslation.model.settings.brandName);
    assert.equal(translated.images.photo, beforeTranslation.images.photo);
    assert.deepEqual(translated.model.views[0], beforeTranslation.model.views[0]);
    assert.doesNotThrow(() => validateProject(JSON.parse(translated.serialized)));
    $('undo-button').click();
    assert.equal(editor.snapshot().model.views.length, 1);
    assert.equal($('product-name').value, beforeTranslation.model.settings.title);
    $('redo-button').click();
    assert.equal($('product-name').value, draft.title);
  } finally { app.dom.window.close(); }
});

test('ZIP snapshots use each view photo selection even after current-card edits', async () => {
  const app = await setup(); const { w, $ } = app;
  try {
    const payload = JSON.parse(w.SATUCARD_EDITOR.snapshot(true).serialized);
    payload.photos.push({ id: 'secondary', source: png });
    payload.views.push({ id: 'second', label: 'Вторая', settings: payload.settings, photoIds: ['secondary'] });
    await w.SATUCARD_EDITOR.restoreProject(JSON.stringify(payload));
    const snapshot = w.SATUCARD_EDITOR.snapshot(), rendered = [], render = w.SATUCARD_RENDERER.render;
    w.SATUCARD_RENDERER.render = function(canvas, settings, images, options) { if (options?.scale === 1) rendered.push(images.photo); return render(canvas, settings, images, options); };
    $('download-set').click(); await until(() => !$('download-set').disabled);
    assert.equal(rendered[0], snapshot.viewImages[snapshot.model.views[0].id].photo);
    assert.equal(rendered[1], snapshot.viewImages.second.photo); assert.notEqual(rendered[0], rendered[1]);
  } finally { app.dom.window.close(); }
});

test('editing between decoded upload files keeps pending photo assets alive', async () => {
  const app = await setup({ imageDelay: 10 }); const { w, $ } = app;
  try {
    let decoded = 0, release;
    w.Image = class { naturalWidth = 10; naturalHeight = 10; set src(value) { this.value = value; decoded++; if (decoded === 3) release = () => this.onload?.(); else setTimeout(() => this.onload?.(), 1); } };
    const files = ['one.png', 'two.png'].map(name => new w.File([new Uint8Array([1])], name, { type: 'image/png' }));
    Object.defineProperty($('photo-input'), 'files', { configurable: true, value: files });
    $('photo-input').dispatchEvent(new w.Event('change', { bubbles: true }));
    await until(() => Boolean(release)); // First photo registered, second decoding.
    $('apply-brand').click(); release();
    await until(() => w.SATUCARD_EDITOR.snapshot().model.libraryIds.length === 3);
    assert.equal(w.SATUCARD_EDITOR.snapshot().images.photos.length, 2);
    assert.equal($('photo-library').children.length, 3);
    assert.doesNotThrow(() => validateProject(JSON.parse(w.SATUCARD_EDITOR.snapshot(true).serialized)));
  } finally { app.dom.window.close(); }
});

test('deleting a shared primary photo resets framing on inactive cards', async () => {
  const app = await setup(); const { w, $ } = app;
  try {
    const editor = w.SATUCARD_EDITOR, payload = JSON.parse(editor.snapshot(true).serialized), first = payload.photos[0].id;
    payload.photos.push({ id: 'second', source: png });
    payload.views.push({ id: 'other', label: 'Другой ракурс', settings: { ...payload.settings, photo: { ...payload.settings.photo, zoom: 2.5, x: 0, rotation: 90 } }, photoIds: [first, 'second'] });
    await editor.restoreProject(JSON.stringify(payload));
    $('photo-library').children[0].querySelector('.photo-delete').click();
    $('product-views').children[1].click();
    assert.equal(editor.snapshot().model.settings.photo.zoom, 1);
    assert.equal(editor.snapshot().model.settings.photo.rotation, 0);
    assert.equal(editor.snapshot().images.photos.length, 1);
  } finally { app.dom.window.close(); }
});


test('every gallery example opens with matching data and keeps its product when changing style', async () => {
  const gallery = new JSDOM(readFileSync(new URL('../examples.html', import.meta.url), 'utf8'));
  const links = [...gallery.window.document.querySelectorAll('[data-editor-template]')].map(link => link.getAttribute('href'));
  gallery.window.close();
  for (const href of links) {
    const url = new URL(href, 'https://satucard.test/'), key = url.searchParams.get('photo');
    const app = await setup({ url: url.href });
    try {
      const sample = app.w.SATUCARD_SAMPLES[key], editor = app.w.SATUCARD_EDITOR;
      assert.equal(app.$('product-name').value, sample.title);
      const before = editor.snapshot().model;
      assert.equal(before.settings.price, sample.price); assert.equal(before.settings.category, sample.category);
      assert.equal(before.photoId, 'sample-' + key); assert.equal(before.settings.template, url.searchParams.get('style'));
      app.w.document.querySelector('[data-template="minimal"]').click();
      const after = editor.snapshot().model;
      assert.equal(after.photoId, before.photoId); assert.equal(after.settings.title, sample.title); assert.equal(after.settings.price, sample.price);
      const payload = JSON.parse(editor.snapshot(true).serialized);
      assert.doesNotThrow(() => validateProject(payload));
      assert.equal(payload.photos[0].source, app.w.SATUCARD_DEMO_IMAGES[key]);
    } finally { app.dom.window.close(); }
  }
});
