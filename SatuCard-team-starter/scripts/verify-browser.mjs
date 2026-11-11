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
    await title('Товар А');
    const a = await page.evaluate(() => sessionStorage.getItem('satucard-active-draft'));
    await open();
    await page.locator('#discard-draft-button').click();
    await title('Товар Б');
    const b = await page.evaluate(() => sessionStorage.getItem('satucard-active-draft'));
    assert.notEqual(a, b);
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
    await duplicate.close();
    await page.locator('#photo-input').setInputFiles(resolve(root, 'assets/images/ceramics.jpg'));
    await page.waitForFunction(() => /Фото загружено|Добавлено фото/.test(document.querySelector('#file-status').textContent));
    await title('Чашка');
    await page.locator('#product-price').fill('4900');
    const download = page.waitForEvent('download');
    await page.locator('#download-button').click();
    if (await page.locator('#export-review').isVisible()) await page.locator('#export-review-download').click();
    assert.equal(await (await download).failure(), null);
    for (const path of ['examples.html', 'pricing.html']) {
      await page.goto(origin + '/' + path);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    }
    await page.goto(origin + '/examples.html');
    await page.waitForFunction(() => document.querySelectorAll('[data-template-item]').length === 14);
    assert.equal(await page.locator('[data-demo-product]').inputValue(), 'headphones');
    assert.deepEqual(errors, []);
    console.log('Browser workflow passed at ' + width + 'px');
    await context.close();
  }
} finally { await browser.close(); }
