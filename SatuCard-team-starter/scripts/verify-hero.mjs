import assert from 'node:assert/strict';
import { mkdir, readFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(process.env.HERO_OUTPUT_DIR || resolve(tmpdir(), 'satucard-hero-3d-preview'));
await mkdir(output, { recursive: true });
const origin = 'http://127.0.0.1:8786';
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || 'msedge',
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist']
});
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2'
};

async function routing(context, requestedUrls) {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    requestedUrls?.push(url.pathname);
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { available: false, projects: [] } });
    const file = resolve(root, '.' + url.pathname);
    if (!file.startsWith(resolve(root) + sep) || !existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ path: file, contentType: mime[extname(file)] });
  });
}

try {
  // 1. Record smooth 3D hero choreography video at 1440x900 (light theme)
  {
    const videoDir = resolve(output, 'video-raw');
    await mkdir(videoDir, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } }
    });
    await routing(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.addInitScript(() => {
      window.__HERO_3D_TRACE = [];
      function sample() {
        const st = window.__SATUCARD_HERO_STATE;
        if (st) {
          window.__HERO_3D_TRACE.push({
            t: performance.now(),
            mode: st.mode,
            phase: st.phase,
            explode: st.explode,
            yawDeg: st.yawDeg,
            style: st.style,
            scrollWidth: document.documentElement.scrollWidth
          });
        }
        if (window.__HERO_3D_TRACE.length < 360) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });

    await page.goto(origin + '/index.html');
    await page.waitForFunction(() => window.__SATUCARD_HERO_STATE?.webglActive === true, null, { timeout: 10000 });
    // Let the full 2.25s opening exploded-to-assembled orbital choreography record cleanly
    await page.waitForFunction(() => window.__SATUCARD_HERO_STATE?.phase === 'ready' && window.__SATUCARD_HERO_STATE?.explode < 0.05, null, { timeout: 8000 });
    await page.waitForTimeout(500);

    // Interactive "Слои 3D" explode toggle
    await page.locator('#hero-explode-toggle').click();
    await page.waitForTimeout(950);

    // Switch to "Нуар" while exploded so the gold+obsidian 3D layers gleam!
    await page.locator('[data-cover-style=noir]').click();
    await page.waitForTimeout(850);

    // Switch to "Постер" while exploded
    await page.locator('[data-cover-style=bold]').click();
    await page.waitForTimeout(850);

    // Assemble card cleanly and return to "Студия"
    await page.locator('[data-cover-style=studio]').click();
    await page.waitForTimeout(350);
    await page.locator('#hero-explode-toggle').click();
    await page.waitForTimeout(900);

    const trace = await page.evaluate(() => window.__HERO_3D_TRACE);
    assert.ok(trace.length >= 25, 'Expected smooth 3D frame trace, got ' + trace.length);
    const maxExplode = Math.max(...trace.map(s => s.explode));
    const minExplode = Math.min(...trace.map(s => s.explode));
    assert.ok(maxExplode >= 0.85, `Expected full exploded 3D start (>=0.85), got ${maxExplode}`);
    assert.ok(minExplode <= 0.08, `Expected clean assembled settle (<=0.08), got ${minExplode}`);
    assert.ok(trace.every(s => s.scrollWidth === 1440), 'Horizontal overflow during 3D choreography');
    assert.deepEqual(errors, [], 'Unexpected console/page errors: ' + errors.join('; '));

    const videoPath = await page.video().path();
    await context.close();
    await copyFile(videoPath, resolve(output, 'hero-3d-showcase.webm'));
    console.log(`3D WebGL video recorded (${trace.length} frames, explode ${maxExplode.toFixed(2)} -> ${minExplode.toFixed(2)}, 0 errors).`);
  }

  // 1b. Capture crisp deterministic inspection stills (exploded, mid-assembly, settled, styles, scroll, dark)
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await routing(context);
    const page = await context.newPage();
    await page.goto(origin + '/index.html');
    await page.waitForFunction(() => window.__SATUCARD_HERO_STATE?.webglActive === true, null, { timeout: 10000 });
    // Frame 1: Full exploded 3D Studio
    await page.evaluate(() => window.__SATUCARD_HERO_3D.setPose({ explode: 0.96, yaw: -0.58, pitch: 0.16 }));
    await page.waitForTimeout(140);
    await page.screenshot({ path: resolve(output, '3d-01-exploded-studio.png') });

    // Frame 2: Mid-assembly orbital sweep
    await page.evaluate(() => window.__SATUCARD_HERO_3D.setPose({ explode: 0.45, yaw: -0.34, pitch: 0.095 }));
    await page.waitForTimeout(140);
    await page.screenshot({ path: resolve(output, '3d-02-mid-assembly.png') });

    // Frame 3: Assembled poised 3D Studio card
    await page.evaluate(() => window.__SATUCARD_HERO_3D.setPose({ explode: 0, yaw: -0.14, pitch: 0.045 }));
    await page.waitForTimeout(140);
    await page.screenshot({ path: resolve(output, '3d-03-assembled-studio.png') });

    // Frame 4: Exploded 3D Noir (obsidian + champagne gold)
    await page.locator('[data-cover-style=noir]').click();
    await page.evaluate(() => window.__SATUCARD_HERO_3D.setPose({ explode: 0.96, yaw: -0.58, pitch: 0.16 }));
    await page.waitForTimeout(320);
    await page.screenshot({ path: resolve(output, '3d-04-exploded-noir.png') });

    // Frame 5: Exploded 3D Poster (electric lime + carbon)
    await page.locator('[data-cover-style=bold]').click();
    await page.evaluate(() => window.__SATUCARD_HERO_3D.setPose({ explode: 0.96, yaw: -0.58, pitch: 0.16 }));
    await page.waitForTimeout(320);
    await page.screenshot({ path: resolve(output, '3d-05-exploded-poster.png') });

    // Wheel over the 3D card must scroll the page normally.
    await page.locator('[data-cover-style=studio]').click();
    await page.evaluate(() => window.__SATUCARD_HERO_3D.setPose(null));
    await page.waitForTimeout(300);
    const vpBox = await page.locator('#hero-3d-viewport').boundingBox();
    await page.mouse.move(vpBox.x + vpBox.width / 2, vpBox.y + vpBox.height / 2);
    await page.mouse.wheel(0, 620);
    await page.waitForTimeout(700);
    const wheelState = await page.evaluate(() => ({
      hero: window.__SATUCARD_HERO_STATE,
      scrollY: window.scrollY
    }));
    assert.ok(wheelState.scrollY > 300, `Wheel over 3D must scroll page, got scrollY=${wheelState.scrollY}`);
    assert.ok(wheelState.hero.explode < 0.08, 'Scrolling must not change the layer state');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.locator('#hero-explode-toggle').click();
    await page.waitForFunction(() => window.__SATUCARD_HERO_STATE?.idleSleeping && window.__SATUCARD_HERO_STATE.explode > 0.65);
    assert.ok((await page.evaluate(() => window.__SATUCARD_HERO_STATE)).explode > 0.65);
    await page.screenshot({ path: resolve(output, '3d-06-button-exploded.png') });
    await page.locator('#hero-explode-toggle').click();
    await page.waitForFunction(() => window.__SATUCARD_HERO_STATE?.idleSleeping && window.__SATUCARD_HERO_STATE.explode < 0.08);
    const reassembled = await page.evaluate(() => window.__SATUCARD_HERO_STATE);
    assert.ok(reassembled.explode < 0.08, `Layer button did not reassemble card: ${reassembled.explode}`);

    // Frame 7 & 8: Dark mode exploded + assembled
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('[data-theme-toggle]').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.evaluate(() => window.__SATUCARD_HERO_3D.setPose({ explode: 0.96, yaw: -0.58, pitch: 0.16 }));
    await page.waitForTimeout(260);
    await page.screenshot({ path: resolve(output, '3d-07-dark-exploded.png') });

    await page.evaluate(() => window.__SATUCARD_HERO_3D.setPose({ explode: 0, yaw: -0.14, pitch: 0.045 }));
    await page.waitForTimeout(260);
    await page.screenshot({ path: resolve(output, '3d-08-dark-assembled.png') });

    // Also test Backplate 180deg spin!
    await page.evaluate(() => window.__SATUCARD_HERO_3D.setPose({ explode: 0, yaw: Math.PI - 0.32, pitch: 0.08 }));
    await page.waitForTimeout(160);
    await page.screenshot({ path: resolve(output, '3d-09-backplate.png') });

    await context.close();
  }

  // 2. Full responsive & workflow checks across 320, 390, 768, 1440 px
  for (const width of [320, 390, 768, 1440]) {
    const isPhone = width <= 767;
    const requestedUrls = [];
    const context = await browser.newContext({
      viewport: { width, height: isPhone ? 844 : 900 },
      hasTouch: isPhone,
      isMobile: isPhone,
      acceptDownloads: true
    });
    await routing(context, requestedUrls);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(origin + '/index.html');
    await page.locator('.cover-frame[data-hero-stage=ready]').waitFor({ timeout: 10000 });
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `Overflow in light mode at ${width}px`);

    if (isPhone) {
      const state = await page.evaluate(() => window.__SATUCARD_HERO_STATE);
      assert.equal(state.mode, '2d-canvas');
      assert.equal(state.webglActive, false);
      assert.ok(!requestedUrls.some(p => p.includes('three.bundle.min.js')), `Phone (${width}px) must NOT download Three.js!`);
      assert.equal(await page.locator('#hero-explode-toggle').isVisible(), false);
    } else {
      await page.waitForFunction(() => window.__SATUCARD_HERO_STATE?.webglActive === true, null, { timeout: 10000 });
      await page.evaluate(() => window.__SATUCARD_HERO_3D.setPose({ explode: 0, yaw: -0.14, pitch: 0.045 }));
      await page.waitForTimeout(150);
      assert.equal(await page.locator('#hero-explode-toggle').isVisible(), true);
    }

    assert.equal((await page.locator('#home-title').textContent()).trim(), 'Карточка товара из вашего фото');
    assert.equal((await page.locator('#hero-create-cta').textContent()).trim(), 'Создать карточку');

    if (width === 390) await page.screenshot({ path: resolve(output, 'mobile-390-light.png') });
    if (width === 320) await page.screenshot({ path: resolve(output, 'mobile-320-light.png') });
    if (width === 768) await page.screenshot({ path: resolve(output, 'tablet-768-light.png') });

    // Switch style on hero -> verify state & 2D synced canvas update
    const beforeCanvas = await page.locator('#cover-card').evaluate(c => c.toDataURL());
    await page.locator('[data-cover-style=noir]').click();
    const noirCanvas = await page.locator('#cover-card').evaluate(c => c.toDataURL());
    assert.notEqual(noirCanvas, beforeCanvas, 'Noir style did not re-render canvas');
    await page.locator('[data-cover-style=bold]').click();
    const posterCanvas = await page.locator('#cover-card').evaluate(c => c.toDataURL());
    assert.notEqual(posterCanvas, noirCanvas, 'Poster style did not re-render canvas');

    // Full seller workflow: "Создать карточку" -> mini-editor -> upload photo -> download PNG
    await page.locator('#hero-create-cta').click();
    await page.locator('#home-studio:visible').waitFor();
    assert.equal(await page.locator('#home-studio [data-hero-style=bold]').getAttribute('aria-pressed'), 'true');
    await page.locator('#quick-file').setInputFiles(resolve(root, 'assets/images/ceramics.jpg'));
    await page.waitForFunction(() => document.getElementById('quick-status').textContent.includes('Фото загружено'));
    await page.locator('#quick-title').fill('Кружка ручной работы');
    await page.locator('#quick-price').fill('5900');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.locator('#quick-png').click()
    ]);
    assert.equal(await download.failure(), null);
    const pngPath = resolve(output, `quick-export-${width}.png`);
    await download.saveAs(pngPath);
    const bytes = await readFile(pngPath);
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [900, 1125]);

    // Check dark theme + Kazakh interface without overflow
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('[data-theme-toggle]').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `Overflow in dark mode at ${width}px`);
    if (width === 390) {
      await page.locator('[data-cover-style=studio]').click();
      await page.waitForTimeout(260);
      await page.screenshot({ path: resolve(output, 'mobile-390-dark.png') });
    }

    await page.evaluate(() => window.SATUCARD_LANGUAGE.setLanguage('kk'));
    assert.match(await page.locator('#home-title').textContent(), /Фотоңыздан/);
    if (!isPhone) {
      assert.equal((await page.locator('#hero-explode-toggle span').textContent()).trim(), '3D қабаттар');
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `Overflow in Kazakh mode at ${width}px`);
    await page.evaluate(() => window.SATUCARD_LANGUAGE.setLanguage('ru'));

    // Check prefers-reduced-motion falls back to instant 2D card on desktop too
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.locator('.cover-frame[data-hero-stage=ready]').waitFor({ timeout: 5000 });
    const rmState = await page.evaluate(() => window.__SATUCARD_HERO_STATE);
    assert.equal(rmState.mode, '2d-canvas');
    assert.equal(rmState.webglActive, false);

    assert.deepEqual(errors, []);
    console.log(`3D hero workflow, styles, PNG export, dark/light & RU/KK passed at ${width}px`);
    await context.close();
  }

  // 3. No-JavaScript fallback
  {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    await routing(context);
    const page = await context.newPage();
    await page.goto(origin + '/index.html');
    assert.equal(await page.locator('#cover-photo').isVisible(), true);
    assert.equal(await page.locator('#hero-create-cta').getAttribute('href'), '#quick-start');
    assert.equal(await page.locator('#quick-fallback a').isVisible(), true);
    await context.close();
    console.log('No-JavaScript fallback passed. Output:', output);
  }
} finally {
  await browser.close();
}
