import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { resolve, sep, extname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const origin = 'http://127.0.0.1:8785';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
});
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 390, isMobile: width === 390 });
    const errors = [];
    context.on('page', page => {
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { available: false, projects: [] } });
      const path = resolve(root, '.' + url.pathname);
      if (!path.startsWith(root + sep) || !existsSync(path)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ path, contentType: mime[extname(path)] });
    });
    const page = await context.newPage();
    async function open(query = '') {
      await page.goto(origin + '/editor.html' + query);
      await page.locator('#editor-form[data-editor-ready=true]').waitFor();
    }
    async function title(value) {
      await page.locator('#tab-content').click();
      await page.locator('#product-name').fill(value);
      await page.waitForFunction(() => document.querySelector('#draft-status').textContent === 'Сохранено на устройстве');
    }
    await open();
    assert.ok(await page.locator('#upload-own-photo').isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    assert.equal(await page.locator('#product-canvas').evaluate(canvas => getComputedStyle(canvas).touchAction), 'pan-y');
    await page.locator('#photo-input').setInputFiles(resolve(root, 'assets/images/ceramics.jpg'));
    await page.waitForFunction(() => /Фото загружено|Добавлено фото/.test(document.querySelector('#file-status').textContent));
    await page.locator('#tab-design').click();
    await page.locator('#design-price').selectOption('outline');
    await title('Товар А');
    const a = await page.evaluate(() => sessionStorage.getItem('satucard-active-draft'));
    const savedCard = () => page.evaluate(() => JSON.parse(window.SATUCARD_EDITOR.snapshot(true).serialized));
    const beforeReturn = await savedCard();
    await page.locator('header .brand').click();
    await page.waitForURL(url => url.pathname === '/index.html');
    await page.waitForLoadState('domcontentloaded');
    const editorLink = page.locator('#main-nav a[href*="editor.html"]');
    const menu = page.locator('[data-menu-toggle]');
    if (await menu.isVisible()) await menu.click();
    await editorLink.click();
    await page.locator('#editor-form[data-editor-ready=true]').waitFor();
    assert.equal(await page.locator('#product-name').inputValue(), 'Товар А');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('satucard-active-draft')), a);
    assert.equal(await page.locator('#draft-restore-banner').isVisible(), false);
    const afterReturn = await savedCard();
    assert.deepEqual(afterReturn.settings.design, { priceStyle: 'outline' });
    assert.deepEqual(afterReturn.photos, beforeReturn.photos);
    await page.locator('#open-local-projects').click();
    await page.locator('#new-local-project').click();
    await page.locator('#editor-form[data-editor-ready=true]').waitFor();
    await title('Товар Б');
    const b = await page.evaluate(() => sessionStorage.getItem('satucard-active-draft'));
    assert.notEqual(a, b);
    await open('?photo=skincare&style=blush');
    assert.equal(await page.locator('#product-name').inputValue(), 'Сыворотка для лица');
    const example = await page.evaluate(() => sessionStorage.getItem('satucard-active-draft'));
    assert.notEqual(example, b);
    await title('Моя сыворотка');
    await page.reload();
    await page.locator('#editor-form[data-editor-ready=true]').waitFor();
    assert.equal(await page.locator('#product-name').inputValue(), 'Моя сыворотка');
    await open('?draft=' + a);
    await page.waitForFunction(() => document.querySelector('#product-name').value === 'Товар А');
    await page.locator('#tab-content').click();
    await page.locator('#product-name').fill('Последняя правка А');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#product-name').value === 'Последняя правка А');
    const records = await page.evaluate(() => window.SATUCARD_PROJECT.draftAction('list'));
    assert.equal(records.find(entry => entry.id === b).title, 'Товар Б');
    const duplicate = await context.newPage();
    await duplicate.goto(origin + '/editor.html?draft=' + a);
    await duplicate.locator('#editor-form[data-editor-ready=true]').waitFor();
    await duplicate.waitForFunction(() => document.querySelector('#product-name').value === 'Последняя правка А');
    const fork = await duplicate.evaluate(() => sessionStorage.getItem('satucard-active-draft'));
    assert.notEqual(fork, a);
    await duplicate.waitForFunction(() => document.querySelector('#draft-status').textContent === 'Сохранено на устройстве');
    await duplicate.locator('#tab-content').click();
    await duplicate.locator('#product-name').fill('Правка в копии');
    await duplicate.waitForFunction(() => document.querySelector('#draft-status').textContent === 'Сохранено на устройстве');
    await duplicate.reload();
    await duplicate.locator('#editor-form[data-editor-ready=true]').waitFor();
    assert.equal(await duplicate.locator('#product-name').inputValue(), 'Правка в копии');
    assert.equal(await page.locator('#product-name').inputValue(), 'Последняя правка А');
    await duplicate.close();
    await page.locator('#photo-input').setInputFiles(resolve(root, 'assets/images/ceramics.jpg'));
    await page.waitForFunction(() => /Фото загружено|Добавлено фото/.test(document.querySelector('#file-status').textContent));
    await title('Чашка');
    await page.locator('#product-price').fill('4900');
    const download = page.waitForEvent('download');
    await page.locator('#download-button').click();
    await page.waitForFunction(() => !document.querySelector('#download-button').disabled);
    if (await page.locator('#export-review').isVisible()) await page.locator('#export-review-download').click();
    assert.equal(await (await download).failure(), null);
    await page.goto(origin + '/index.html');
    assert.equal(await page.locator('#cover-zoom').count(), 0);
    await page.locator('.cover-frame[data-hero-stage=ready]').waitFor();
    await page.locator('[data-cover-style=noir]').click();
    assert.equal(await page.locator('.cover-frame').getAttribute('data-active-style'), 'noir');
    await page.locator(width < 768 ? '#cover-card:visible' : '.hero-3d-canvas:visible').waitFor();
    for (const path of ['examples.html', 'pricing.html']) {
      await page.goto(origin + '/' + path);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    }
    await page.goto(origin + '/examples.html');
    await page.waitForFunction(() => document.querySelectorAll('[data-template-item]').length === Object.keys(window.SATUCARD_RENDERER?.templates || {}).length && document.querySelector('[data-template-item=cherry]'));
    assert.equal(await page.locator('[data-demo-product]').inputValue(), 'mixed');
    assert.deepEqual(errors, []);
    console.log('Browser workflow passed at ' + width + 'px');
    await context.close();
  }
} finally { await browser.close(); }
