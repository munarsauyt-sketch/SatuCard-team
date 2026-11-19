import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(process.env.AUDIT_ARTIFACTS || resolve(tmpdir(), 'satucard-audit-fixes'));
await mkdir(output, { recursive: true });
const origin = 'http://127.0.0.1:8798';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4' };
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
const results = [];

async function fixture(viewport = { width: 390, height: 844 }, theme = 'dark', blocked = false, authenticated = false) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', acceptDownloads: true });
  const errors = [];
  await context.addInitScript(({ theme, blocked, authenticated }) => {
    localStorage.setItem('satucard-theme', theme);
    localStorage.setItem('satucard-video-tour-seen-v2', '1');
    if (authenticated) localStorage.setItem('satucard-session-v1', JSON.stringify({
      access_token: 'audit-local-token', refresh_token: 'audit-local-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'audit@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z' }
    }));
    if (blocked) Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
  }, { theme, blocked, authenticated });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/profile') return route.fulfill({ json: { profile: { name: 'Тестовый продавец', first_name: 'Тестовый', last_name: 'Продавец', profile_completed_at: '2026-01-01T00:00:00Z' } } });
    if (url.pathname === '/api/card') return route.fulfill({ json: { id: url.searchParams.get('id'), title: 'Тестовый товар', price: 4990.50, oldPrice: null, brandName: 'Тестовый магазин', imageUrl: origin + '/assets/images/ceramics.jpg', showPrice: true, showBrand: true, contactUrl: 'https://wa.me/77000000000' } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { available: false, projects: [], preview: true, newFonts: ['golos', 'noto', 'plex'], newTemplates: ['showcase'] } });
    const file = resolve(root, '.' + url.pathname);
    if (!file.startsWith(resolve(root) + sep) || !existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ path: file, contentType: mime[extname(file)] });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('dialog', dialog => dialog.accept());
  return { context, page, errors };
}
async function ready(page, name) {
  await page.goto(`${origin}/${name}.html`);
  if (name === 'video') await page.locator('body[data-ready=true]').waitFor();
  if (name === 'editor') await page.waitForFunction(() => !!window.SATUCARD_EDITOR);
  if (name === 'index') await page.waitForFunction(() => document.querySelector('#hero-card.rendered') && !document.querySelector('#quick-title').disabled);
  await page.evaluate(() => document.fonts.ready);
}

try {
  for (const viewport of [{ width: 320, height: 740 }, { width: 700, height: 500 }]) for (const theme of ['dark', 'light']) {
    const app = await fixture(viewport, theme);
    try {
      for (const name of ['index', 'editor', 'video', 'auth', 'dashboard']) {
        await ready(app.page, name);
        const geometry = await app.page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
          headers: [...document.querySelectorAll('.header-inner,.studio-header,.topbar')].map(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right }; }) }));
        assert.equal(geometry.scroll, viewport.width, `${name} ${theme}: ${JSON.stringify(geometry)}`);
        assert.ok(geometry.headers.every(r => r.left >= 0 && r.right <= viewport.width + 1), name + ' header');
        if (name === 'video' && viewport.width === 700) {
          const header = await app.page.locator('.topbar').evaluate(node => ({ height: node.getBoundingClientRect().height,
            rows: [...node.children].map(row => ({ class: row.className, height: row.getBoundingClientRect().height,
              children: [...row.children].map(child => ({ class: child.className, height: child.getBoundingClientRect().height, margin: getComputedStyle(child).margin })) })) }));
          assert.ok(header.height <= 125, 'Short landscape header: ' + JSON.stringify(header));
        }
        await app.page.screenshot({ path: resolve(output, `${name}-${theme}-${viewport.width}.png`) });
        assert.deepEqual(app.errors, [], `${name} console`);
        results.push({ name, theme, ...viewport, passed: true });
      }
    } finally { await app.context.close(); }
  }

  for (const width of [390, 1440]) for (const theme of ['dark', 'light']) for (const name of ['card', 'profile', 'pricing', 'examples', 'guide', 'video-guide']) {
    const app = await fixture({ width, height: 900 }, theme, false, name === 'profile');
    try {
      await app.page.goto(`${origin}/${name}.html` + (name === 'card' ? '?id=11111111-1111-4111-8111-111111111111' : ''));
      if (name === 'card') await app.page.locator('#main[data-state=ready]').waitFor();
      if (name === 'profile') await app.page.locator('#first-name:enabled').waitFor();
      if (name === 'pricing') await app.page.locator('[data-plan=max3]').waitFor();
      await app.page.evaluate(() => document.fonts.ready);
      assert.equal(await app.page.evaluate(() => document.documentElement.scrollWidth), width, `${name} ${theme} ${width}`);
      assert.deepEqual(app.errors, [], name + ' console');
      await app.page.screenshot({ path: resolve(output, `${name}-${theme}-${width}.png`) });
      results.push({ name, theme, width, scenario: 'supporting-page', passed: true });
    } finally { await app.context.close(); }
  }

  // Reload with a real IndexedDB photo, style and comma decimal price, including
  // a final keystroke recovered from the synchronous text journal.
  const home = await fixture();
  try {
    await ready(home.page, 'index');
    await home.page.locator('#quick-file').setInputFiles(resolve(root, 'assets/images/ceramics.jpg'));
    await home.page.waitForFunction(() => !document.querySelector('#quick-title').disabled && document.querySelector('#quick-title').value === '');
    await home.page.locator('#quick-title').fill('Сохранённый товар');
    await home.page.locator('#quick-price').fill('4990,50');
    await home.page.locator('[data-hero-style="noir"]').click();
    await home.page.evaluate(async () => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const raw = await window.SATUCARD_PROJECT.draftAction('get', undefined, 'home-quick');
        if (raw && JSON.parse(raw).quickDraft?.title === 'Сохранённый товар') return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error('Quick draft did not persist');
    });
    const photo = await home.page.locator('#quick-photo').getAttribute('src');
    await home.page.locator('#quick-title').fill('Последняя правка');
    await ready(home.page, 'index');
    assert.equal(await home.page.locator('#quick-title').inputValue(), 'Последняя правка', await home.page.evaluate(async () => JSON.stringify({
      status: document.querySelector('#quick-status').textContent,
      entries: (await window.SATUCARD_PROJECT.draftAction('list')).map(entry => ({id: entry.id, title: entry.title, meta: JSON.parse(entry.payload).quickDraft})),
      draft: JSON.parse(await window.SATUCARD_PROJECT.draftAction('get', undefined, 'home-quick') || 'null')?.quickDraft,
      journal: localStorage.getItem('satucard-quick-journal')
    })));
    assert.equal(await home.page.locator('#quick-price').inputValue(), '4990,50');
    assert.equal(await home.page.locator('#quick-photo').getAttribute('src'), photo);
    assert.equal(await home.page.locator('[data-hero-style="noir"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(home.errors, []);
    results.push({ scenario: 'home-photo-text-price-style-reload', passed: true });
  } finally { await home.context.close(); }

  const editor = await fixture();
  try {
    await ready(editor.page, 'editor');
    await editor.page.locator('[data-editor-tab="content"]').click();
    await editor.page.waitForFunction(() => { const r = document.querySelector('[data-editor-panel="content"]').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight / 2; });
    await editor.page.waitForFunction(() => document.querySelector('#cloud-capabilities').textContent.includes('новые шрифты'));
    assert.deepEqual(editor.errors, []);
    results.push({ scenario: 'mobile-tab-reveals-controls-and-preview-storage-notice', passed: true });
  } finally { await editor.context.close(); }

  // Named drafts use actual IndexedDB transactions, including simultaneous saves
  // and an old record omitted by the former index truncation.
  const video = await fixture({ width: 1440, height: 900 });
  try {
    await ready(video.page, 'video');
    const fontAndExport = await video.page.evaluate(async () => {
      const before = performance.getEntriesByType('resource').filter(entry => entry.name.includes('/fonts/')).map(entry => entry.name.split('/').at(-1));
      const { emptyProject, layer } = await import('./video-model.js');
      const { MediaStore } = await import('./video-media.js');
      const { exportVideo } = await import('./video-export.js');
      const project = emptyProject(); project.duration = 1;
      project.layers.push(layer('text', { font: 'Noto Serif', text: 'Қазақша · Русский', start: 0, end: 1 }));
      const media = new MediaStore();
      const blob = await exportVideo(project, media, { height: 1920 });
      const output = document.createElement('video'), url = URL.createObjectURL(blob); output.muted = true; output.src = url;
      try {
        await new Promise((resolve, reject) => { output.onloadeddata = resolve; output.onerror = () => reject(new Error('Full HD MP4 does not decode')); });
        return { before, fontReady: document.fonts.check('700 30px "Noto Serif"'), bytes: blob.size, width: output.videoWidth, height: output.videoHeight, duration: output.duration };
      } finally { output.removeAttribute('src'); output.load(); URL.revokeObjectURL(url); media.dispose(); }
    });
    assert.ok(!fontAndExport.before.includes('NotoSerif.ttf'), 'Noto Serif should load on use, not at startup');
    assert.equal(fontAndExport.fontReady, true);
    assert.equal(fontAndExport.width, 1080); assert.equal(fontAndExport.height, 1920);
    assert.ok(fontAndExport.bytes > 1000 && Math.abs(fontAndExport.duration - 1) < .2);
    results.push({ scenario: 'lazy-fonts-kazakh-and-free-full-hd-export', ...fontAndExport, passed: true });
    const storage = await video.page.evaluate(async () => {
      const store = await import('./video-storage.js'), { emptyProject } = await import('./video-model.js');
      const calls = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => store.saveVideoDraft('Черновик ' + i, emptyProject(), new Map())));
      const drafts = await store.listVideoDrafts();
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('satucard-video-v1', 1);
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction('records', 'readwrite');
          tx.objectStore('records').put({ id: 'old-orphan', name: 'Скрытый старый', project: emptyProject(), files: [], updatedAt: 1 }, 'draft:old-orphan');
          tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
        }; request.onerror = () => reject(request.error);
      });
      const recovered = await store.listVideoDrafts();
      await store.deleteVideoDraft('old-orphan'); await store.deleteVideoDraft(drafts[0].id);
      const added = await store.saveVideoDraft('После удаления', emptyProject(), new Map());
      return { saved: calls.filter(r => r.status === 'fulfilled').length, rejected: calls.filter(r => r.status === 'rejected').map(r => r.reason.code),
        recovered: recovered.length, count: (await store.listVideoDrafts()).length, reopened: (await store.loadVideoDraft(added.id)).name };
    });
    assert.equal(storage.saved, 10); assert.deepEqual(storage.rejected, ['video_draft_limit', 'video_draft_limit']);
    assert.equal(storage.recovered, 11); assert.equal(storage.count, 10); assert.equal(storage.reopened, 'После удаления');
    assert.deepEqual(video.errors, []);
    results.push({ scenario: 'draft-limit-concurrency-orphan-recovery-delete', ...storage, passed: true });
  } finally { await video.context.close(); }

  const degraded = await fixture({ width: 700, height: 500 }, 'dark', true);
  try {
    await ready(degraded.page, 'video');
    assert.match(await degraded.page.locator('#save-status').innerText(), /Не сохранено/);
    assert.match(await degraded.page.locator('#video-draft-list').innerText(), /недоступно/);
    assert.ok(await degraded.page.locator('#batch-actions button').count());
    const downloaded = degraded.page.waitForEvent('download');
    await degraded.page.locator('#save-file').click();
    assert.match((await downloaded).suggestedFilename(), /\.satuvideo\.json$/);
    assert.deepEqual(degraded.errors, []);
    results.push({ scenario: 'blocked-indexeddb-studio-ready-manual-file-save', passed: true });
  } finally { await degraded.context.close(); }
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`Audit regressions passed: ${results.length} cases. Artifacts: ${output}`);
} finally { await browser.close(); }
