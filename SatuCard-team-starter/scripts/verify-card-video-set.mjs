import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'http://127.0.0.1:8786';
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
const artifacts = process.env.CARD_VIDEO_ARTIFACTS;
if (artifacts) mkdirSync(artifacts, { recursive: true });
try {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.addInitScript(() => localStorage.setItem('satucard-video-tour-seen-v2', '1'));
    await page.route('**/*', route => {
      const url = new URL(route.request().url()), path = resolve(root, '.' + url.pathname);
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { projects: [], available: false } });
      if (!path.startsWith(resolve(root) + sep) || !existsSync(path)) return route.fulfill({ status:404 });
      return route.fulfill({ path, contentType:mime[extname(path)] });
    });
    await page.goto(origin + '/editor.html');
    await page.locator('#editor-form[data-editor-ready=true]').waitFor();
    const bytes = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = c.height = 120;
      const ctx = c.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0,0,120,120);
      ctx.fillStyle = '#174483'; ctx.fillRect(30,30,60,60);
      return c.toDataURL().split(',')[1];
    });
    const file = { name:'product.png', mimeType:'image/png', buffer:Buffer.from(bytes, 'base64') };
    await page.locator('#photo-input').setInputFiles(file);
    await page.waitForFunction(() => document.querySelector('#file-status').textContent.includes('Фото загружено'));
    await page.locator('#product-name').fill('Шар');
    await page.locator('#feature-1').fill('Диаметр 24 см');
    await page.locator('#tab-photo').click();
    await page.getByText('Удалить однотонный фон', {exact:true}).first().click();
    await page.locator('#remove-background').click();
    await page.waitForFunction(() => window.SATUCARD_EDITOR.snapshot(true).serialized.includes('data:image/png;base64'));
    const shadow = await page.evaluate(() => {
      const { images } = window.SATUCARD_EDITOR.snapshot();
      const c = document.createElement('canvas');
      const { photoRect:r, photoScale } = window.SATUCARD_RENDERER.render(c,{template:'minimal', title:'Шар', showPrice:false},images);
      const cx = Math.round(r.x + r.width/2), y = Math.round(r.y + r.height/2 + images.photo.naturalHeight * photoScale/4);
      const ctx = c.getContext('2d');
      return [1,25].map(offset => ctx.getImageData(cx, y + offset, 1, 1).data[0]);
    });
    assert.ok(shadow[0] + 8 < shadow[1], 'visible contact shadow beneath the actual alpha edge: ' + shadow);
    await page.getByText('Лупа и размер на фото', {exact:true}).click();
    await page.locator('#macro-enabled').check(); await page.locator('#pick-macro').click();
    const pick = await page.evaluate(() => {
      const canvas = document.querySelector('#product-canvas'), {model,images} = window.SATUCARD_EDITOR.snapshot();
      const {photoRect:r} = window.SATUCARD_RENDERER.render(document.createElement('canvas'), model.settings, images);
      const scale = canvas.getBoundingClientRect().width/900;
      const point = window.SATUCARD_RENDERER.photoPlacement(model.settings.photo, images.photo, r).toFrame(.65, .45);
      return {x:point.x*scale, y:point.y*scale};
    });
    await page.locator('#product-canvas').click({position:pick});
    assert.ok(Math.abs(Number(await page.locator('#macro-x').inputValue()) - 65) <= 1);
    await page.locator('#dimension-enabled').check(); await page.locator('#dimension-label').fill('24 см');
    await page.locator('#create-kz').click();
    await page.locator('#product-name').fill('Ш'.repeat(60));
    await page.locator('#feature-1').fill('Диаметрі 24 см');
    await page.locator('#compare-kz').waitFor();
    const [ru,kz] = await Promise.all(['#compare-ru','#compare-kz'].map(id => page.locator(id).boundingBox()));
    assert.ok(kz.x >= ru.x + ru.width - 1 && Math.abs(kz.y-ru.y)<2);
    assert.match(await page.locator('#compare-status').textContent(), /Сократите заголовок/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (artifacts) await page.locator('#language-compare').screenshot({path:resolve(artifacts,'compare-'+width+'.png')});
    await page.locator('#make-video-button').click();
    await page.locator('body[data-ready=true]').waitFor({timeout:35000});
    const clips = await page.evaluate(async () => {
      const { loadProject } = await import('./video-storage.js'), { scenes } = await import('./video-workflow.js');
      const {project} = await loadProject();
      return scenes(project).map(s => s.items.map(i => i.text));
    });
    assert.equal(clips.length,2); assert.ok(clips[0].includes('• Диаметр 24 см')); assert.ok(clips[1].includes('• Диаметрі 24 см'));
    if (width === 1440) {
      const before = await page.locator('.media-card').count();
      await page.locator('#project-name').fill('Промежуточное имя');
      await page.locator('#project-name').press('Tab');
      // Pause at the browser decoder, then undo within the same project id.
      await page.evaluate(() => {
        const decode = HTMLImageElement.prototype.decode;
        HTMLImageElement.prototype.decode = async function () {
          HTMLImageElement.prototype.decode = decode;
          await new Promise(resolve => { window.finishPhotoDecode = resolve; });
          return decode.call(this);
        };
      });
      await page.locator('#media-input').setInputFiles(file);
      await page.waitForFunction(() => typeof window.finishPhotoDecode === 'function');
      await page.locator('#undo').click();
      await page.evaluate(() => window.finishPhotoDecode());
      await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Ролик изменился'));
      assert.equal(await page.locator('.media-card').count(),before);
    }
    assert.deepEqual(errors,[]);
    console.log('Card tools, RU/KZ and video handoff passed at '+width+'px');
    await context.close();
  }
} finally { await browser.close(); }
