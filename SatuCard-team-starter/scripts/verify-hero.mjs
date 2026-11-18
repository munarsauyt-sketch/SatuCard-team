import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(process.env.HERO_OUTPUT_DIR || resolve(tmpdir(), 'satucard-hero-preview'));
await mkdir(output, { recursive: true });
const origin = 'http://127.0.0.1:8785';
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
async function routing(context) {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { available: false, projects: [] } });
    const file = resolve(root, '.' + url.pathname);
    if (!file.startsWith(resolve(root) + sep) || !existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ path: file, contentType: mime[extname(file)] });
  });
}
try {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 390, isMobile: width === 390 });
    await routing(context);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/index.html');
    await page.locator('#cover-png:enabled').waitFor();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.locator('.showcase-motion').click();
    await page.locator('.cover-spread').screenshot({ path: resolve(output, 'hero-' + width + '.png') });
    if (width === 1440) { await page.evaluate(() => window.scrollTo(0,0)); await page.screenshot({ path: resolve(output, 'landing-desktop.png') }); }

    // Both the endpoints and the continuous comparison work with the keyboard.
    await page.locator('#cover-compare').focus();
    await page.keyboard.press('Home');
    assert.equal(await page.locator('.cover-art').getAttribute('data-mode'), 'card');
    await page.keyboard.press('End');
    assert.equal(await page.locator('.cover-art').getAttribute('data-mode'), 'photo');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#cover-compare').inputValue(), '99');
    await page.locator('#cover-compare').scrollIntoViewIfNeeded();
    const box = await page.locator('#cover-compare').boundingBox();
    if (width === 390) await page.touchscreen.tap(box.x + box.width * .65, box.y + box.height * .45);
    else await page.mouse.click(box.x + box.width * .65, box.y + box.height * .45);
    assert.ok(Number(await page.locator('#cover-compare').inputValue()) > 55 && Number(await page.locator('#cover-compare').inputValue()) < 75);
    await page.locator('[data-cover-mode=card]').click();
    assert.equal(await page.locator('#cover-compare').inputValue(), '0');
    assert.equal(await page.locator('.showcase-badge').evaluate(el => getComputedStyle(el).animationPlayState), 'paused');

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.locator('#cover-png').click({ timeout: 5000 })
    ]);
    assert.equal(await download.failure(), null);
    const file = resolve(output, 'example-' + width + '.png');
    await download.saveAs(file);
    const bytes = await readFile(file);
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [900,1125]);

    // A failed render retains the complete image and permits a retry.
    const lastRender = await page.locator('#cover-card').evaluate(canvas => canvas.toDataURL());
    await page.evaluate(() => {
      const original = window.SATUCARD_RENDERER.render;
      window.SATUCARD_RENDERER.render = (...args) => {
        window.SATUCARD_RENDERER.render = original;
        throw new Error('Test: renderer temporarily unavailable');
      };
      document.querySelector('[data-cover-product=headphones]').click();
    });
    await page.locator('#cover-status:not(.sr-only)').waitFor();
    assert.equal(await page.locator('#cover-card').evaluate(canvas => canvas.toDataURL()), lastRender);
    await page.evaluate(() => {
      document.querySelector('[data-cover-product=headphones]').click();
      document.querySelector('[data-cover-product=skincare]').click();
    });
    await page.locator('.cover-art[data-product=skincare][aria-busy=false]').waitFor();
    assert.match(await page.locator('#cover-name').textContent(), /Сыворотка/);
    assert.equal(await page.locator('#cover-old-price').isVisible(), false);
    await page.locator('[data-cover-product=ceramics]').click();
    await page.locator('.cover-art[data-product=ceramics][aria-busy=false]').waitFor();

    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.showcase-badge').evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.locator('[data-cover-mode=photo]').click();
    assert.equal(await page.locator('.cover-art').evaluate(el => el.classList.contains('is-transitioning')), false);
    await page.locator('[data-theme-toggle]').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.evaluate(() => window.SATUCARD_LANGUAGE.setLanguage('kk'));
    assert.match(await page.locator('.cover-pill').textContent(), /үшін/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    if (width === 390) await page.locator('.cover-spread').screenshot({ path: resolve(output, 'hero-390-light-kk.png'), animations: 'disabled' });
    await page.evaluate(() => window.SATUCARD_LANGUAGE.setLanguage('ru'));

    if (width === 1440) {
      // Saved editor data must exactly match the displayed hero, including its sale price.
      await page.locator('#cover-open').click();
      await page.locator('#editor-form[data-editor-ready=true]').waitFor();
      assert.equal(await page.locator('#product-price').inputValue(), '4500');
      assert.equal(await page.locator('#product-name').inputValue(), 'Керамическая чашка');
      await page.goto(origin + '/index.html?theme=dark');
      await page.locator('#cover-video:enabled').waitFor();
      await page.locator('#cover-video').click();
      await page.waitForURL('**/video.html*');
      await page.locator('body[data-ready=true]').waitFor();
      assert.equal(await page.locator('#product-form [name=title]').inputValue(), 'Керамическая чашка');
      assert.equal((await page.locator('#product-form [name=price]').inputValue()).replace(/\u00a0/g,' '), '4 500 ₸');
    }
    assert.deepEqual(errors, []);
    console.log('Hero, comparison, export and responsive checks passed: ' + width + 'px');
    await context.close();
  }
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
  await routing(context);
  const page = await context.newPage();
  await page.goto(origin + '/index.html');
  assert.equal(await page.locator('#cover-photo').isVisible(), true);
  assert.equal(await page.locator('#cover-png').isVisible(), false);
  assert.equal(await page.locator('.cover-primary').getAttribute('href'), '#quick-start');
  assert.equal(await page.locator('#quick-fallback a').isVisible(), true);
  await context.close();
  console.log('No-JavaScript fallback passed. Screenshots: ' + output);
} finally { await browser.close(); }
