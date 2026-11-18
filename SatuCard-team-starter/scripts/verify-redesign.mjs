import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(process.env.REDESIGN_ARTIFACTS || resolve(tmpdir(), 'satucard-redesign'));
await mkdir(output, { recursive: true });
const origin = 'http://127.0.0.1:8795';
const pages = ['index', 'editor', 'video', 'auth', 'dashboard'];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const headers = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8')).routes[0].headers;
const session = { access_token: 'ui-test-access-token', refresh_token: 'ui-test-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'ui-test-user', email: 'interface@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z' } };
const profile = { name: 'Тестовый профиль', email: session.user.email, created_at: '2026-01-01T00:00:00Z', profile_completed_at: '2026-01-01T00:00:00Z' };
const billing = { ready: true, ordering: false, isAdmin: false, active: { planId: 'basic', planName: 'Тестовый тариф', expiresAt: '2027-01-01T00:00:00Z', remainingPercent: 37, exhausted: false }, scheduled: [], models: [], plans: [], orders: [], payment: {} };
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
const results = [], interactions = [];

async function createContext(width, theme, authenticated = false, state = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', hasTouch: width === 390, isMobile: width === 390 });
  const errors = [], responses = [];
  await context.addInitScript(({ theme, authenticated, session }) => {
    if (location.origin !== 'http://127.0.0.1:8795') return;
    localStorage.setItem('satucard-theme', theme);
    localStorage.setItem('satucard-video-tour-seen-v2', '1');
    if (authenticated) localStorage.setItem('satucard-session-v1', JSON.stringify(session));
  }, { theme, authenticated, session });
  context.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') responses.push(message.text()); });
    page.on('dialog', dialog => dialog.accept());
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname.endsWith('.supabase.co')) {
      if (state.authDelay) await new Promise(done => setTimeout(done, state.authDelay));
      return route.fulfill({ status: 400, json: { error_code: 'invalid_credentials', message: 'Invalid login credentials' } });
    }
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      if (state.delay) await new Promise(done => setTimeout(done, state.delay));
      if ((state.error || state.errorPath === url.pathname) && ['/api/profile', '/api/my-cards', '/api/projects', '/api/billing'].includes(url.pathname)) return route.fulfill({ status: 503, json: { error: 'Тест: сервис временно недоступен. Повторите попытку.' } });
      if (url.pathname === '/api/profile') return route.fulfill({ json: { profile } });
      if (url.pathname === '/api/my-cards') return route.fulfill({ json: { cards: state.cards || [], nextOffset: null } });
      if (url.pathname === '/api/cards' && route.request().method() === 'DELETE') {
        state.cards = (state.cards || []).filter(card => card.id !== url.searchParams.get('id'));
        return route.fulfill({ json: { deleted: true } });
      }
      if (url.pathname === '/api/billing') return route.fulfill({ json: state.billing || billing });
      if (url.pathname === '/api/projects') {
        const id = url.searchParams.get('id');
        if (route.request().method() === 'DELETE') {
          state.projects = (state.projects || []).filter(p => p.id !== id);
          return route.fulfill({ json: { deleted: true } });
        }
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON();
          state.projects = state.projects.map(p => p.id === body.id ? { ...p, ...body, version: p.version + 1 } : p);
          return route.fulfill({ json: { project: state.projects.find(p => p.id === body.id) } });
        }
        if (id) return route.fulfill({ json: { project: state.projects.find(p => p.id === id) } });
        const projects = (state.projects || []).filter(p => !!p.archived === (url.searchParams.get('archived') === '1') && p.title.toLowerCase().includes((url.searchParams.get('q') || '').toLowerCase()));
        return route.fulfill({ json: { projects, nextOffset: null } });
      }
      return route.fulfill({ json: { available: false, projects: [] } });
    }
    const file = resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + sep) || !existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ path: file, contentType: mime[extname(file)], headers });
  });
  return { context, errors, responses };
}

async function inspect(page, name, width, theme, state = 'default') {
  await page.evaluate(() => document.fonts.ready);
  const layout = await page.evaluate(() => {
    const visible = element => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && element.getBoundingClientRect().width > 0;
    const overflow = [...document.querySelectorAll('main *,header *,#workspace *')].filter(visible).filter(element => {
      const rect = element.getBoundingClientRect();
      if (rect.right <= innerWidth + 1 && rect.left >= -1) return false;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (['hidden', 'auto', 'scroll', 'clip'].includes(getComputedStyle(parent).overflowX)) return false;
      }
      return true;
    }).map(element => ({ tag: element.tagName, id: element.id, class: element.className.baseVal ?? element.className })).slice(0, 20);
    return { scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth, overflow, renderedTheme: document.documentElement.dataset.theme, bodyColor: getComputedStyle(document.body).backgroundColor };
  });
  const stem = `${name}-${theme}-${width}${state === 'default' ? '' : '-' + state}`;
  await page.screenshot({ path: resolve(output, stem + '.png'), fullPage: true, animations: 'disabled' });
  await page.screenshot({ path: resolve(output, stem + '-viewport.png'), animations: 'disabled' });
  return { page: name, width, theme, state, ...layout };
}

async function authStates(page, width, theme, fixture, state) {
  await page.locator('#auth-submit').click();
  assert.equal(await page.locator('#auth-email').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'auth-email');
  await page.locator('#auth-email').fill('interface@example.invalid');
  await page.locator('#auth-password').fill('short');
  await page.locator('#auth-submit').click();
  assert.equal(await page.locator('#auth-password-error').isVisible(), true);
  await page.locator('#auth-login-tab').focus(); await page.keyboard.press('End');
  assert.equal(await page.locator('#auth-signup-tab').getAttribute('aria-selected'), 'true');
  await page.locator('#auth-email').fill('interface@example.invalid');
  await page.locator('#auth-password').fill('test-password-only');
  await page.locator('#auth-confirm').fill('different-password');
  await page.locator('[data-password-toggle=auth-password]').click();
  assert.equal(await page.locator('#auth-password').getAttribute('type'), 'text');
  await page.locator('#auth-submit').click();
  assert.equal(await page.locator('#auth-confirm-error').isVisible(), true);
  results.push(await inspect(page, 'auth', width, theme, 'validation'));
  await page.locator('#auth-login-tab').click();
  await page.locator('#auth-email').fill('interface@example.invalid');
  await page.locator('#auth-password').fill('test-password-only');
  state.authDelay = 1300;
  await page.locator('#auth-submit').click();
  assert.equal(await page.locator('#auth-submit').isDisabled(), true);
  assert.equal(await page.locator('#auth-card-content').getAttribute('aria-busy'), 'true');
  results.push(await inspect(page, 'auth', width, theme, 'loading'));
  await page.locator('#auth-notice.error').waitFor();
  await page.locator('#auth-submit:enabled').waitFor();
  assert.match(await page.locator('#auth-notice').textContent(), /Неверный email или пароль/);
  results.push(await inspect(page, 'auth', width, theme, 'server-error'));
  assert.ok(fixture.responses.every(text => text.includes('400 (Bad Request)')), fixture.responses.join('\n'));
  fixture.responses.length = 0;
  await page.locator('#email-code-login').click();
  assert.equal(await page.locator('#email-code-form').isVisible(), true);
  await page.locator('#email-code-form [type=submit]').click();
  assert.equal(await page.locator('#email-code-error').isVisible(), true);
  await page.locator('#code-back').click();
  assert.equal(await page.locator('#auth-form').isVisible(), true);
  interactions.push(`auth ${width} ${theme}: keyboard tabs, field validation, password visibility, busy, failed login, email code`);
}

async function dashboardStates(page, width, theme, fixture, state) {
  assert.equal(await page.locator('#billing-progress').getAttribute('value'), '37');
  assert.equal(await page.locator('#local-project-empty').isVisible(), true);
  assert.equal(await page.locator('#projects-empty').isVisible(), true);
  // Seed through the real local editor, never through a production account.
  await page.goto(origin + '/editor.html?new=1');
  await page.locator('#editor-form[data-editor-ready=true]').waitFor();
  await page.locator('#tab-content').click();
  await page.locator('#product-name').fill('Тестовая чашка');
  await page.waitForFunction(() => document.querySelector('#draft-status').textContent === 'Сохранено на устройстве');
  state.projects = [{ id: 'fixture-project', title: 'Тестовая чашка', version: 1, archived: false, updatedAt: '2026-11-01T10:00:00Z', payload: {} }];
  state.cards = [{ id: 'fixture-publication', title: 'Тестовая чашка', price: 4500, imageUrl: '/assets/images/ceramics.jpg', imagePath: 'fixture.jpg', format: 'portrait', createdAt: '2026-11-01T10:00:00Z' }];
  await page.goto(origin + '/dashboard.html');
  await page.locator('.dashboard-main[data-state=ready]').waitFor();
  await page.locator('.cloud-project-card').waitFor();
  await page.locator('.local-project-list > li').waitFor();
  results.push(await inspect(page, 'dashboard', width, theme, 'populated'));
  const preview = await page.locator('.my-card-image-stage').boundingBox();
  assert.ok(preview.height <= preview.width, 'Publication previews must stay compact, independent of source image size');
  await page.locator('#local-project-search').fill('Не существующий товар');
  assert.equal(await page.locator('#local-project-empty').isVisible(), true);
  await page.locator('#local-project-search').fill('');
  await page.locator('#projects-search').fill('Не существующий товар');
  await page.waitForFunction(() => document.querySelector('#projects-status').dataset.state === 'empty');
  assert.equal(await page.locator('#projects-empty').isVisible(), true);
  await page.locator('#projects-search').fill('');
  await page.locator('.cloud-project-card').waitFor();
  await page.locator('.cloud-project-card').getByRole('button', { name: 'В архив', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#projects-status').dataset.state === 'empty');
  await page.locator('#projects-archived').check();
  await page.locator('.cloud-project-card').waitFor();
  assert.equal(await page.locator('.cloud-project-card').getByRole('button', { name: 'Вернуть из архива' }).isVisible(), true);
  await page.locator('.cloud-project-card').getByRole('button', { name: 'Удалить', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#projects-status').dataset.state === 'empty');
  await page.locator('.local-project-list button').click();
  await page.locator('#local-project-empty').waitFor();
  await page.locator('.publication-actions button').click();
  await page.locator('#dashboard-empty').waitFor();
  assert.equal(await page.locator('#cards-count').textContent(), '0');
  state.error = true;
  await page.goto(origin + '/dashboard.html');
  await page.locator('.dashboard-main[data-state=error]').waitFor();
  await page.locator('#billing-retry').waitFor();
  await page.waitForFunction(() => document.querySelector('#projects-status').dataset.state === 'error');
  assert.equal(await page.locator('#billing-usage').isVisible(), false);
  assert.equal(await page.locator('#projects-loading').isVisible(), false);
  results.push(await inspect(page, 'dashboard', width, theme, 'error'));
  state.error = false;
  await page.locator('#billing-retry').click();
  await page.waitForFunction(() => document.querySelector('#billing-status').dataset.state === 'ready');
  await page.locator('#projects-refresh').click();
  await page.waitForFunction(() => document.querySelector('#projects-status').dataset.state === 'empty');
  await page.locator('#dashboard-retry').click();
  await page.locator('.dashboard-main[data-state=empty]').waitFor();
  state.errorPath = '/api/my-cards';
  await page.reload();
  await page.locator('.dashboard-main[data-state=error]').waitFor();
  assert.equal(await page.locator('#profile-title').textContent(), profile.name);
  assert.equal(await page.locator('#cards-loading').isVisible(), false);
  assert.equal(await page.locator('#dashboard-retry').isVisible(), true);
  assert.ok(fixture.responses.every(text => text.includes('503 (Service Unavailable)')), fixture.responses.join('\n'));
  fixture.responses.length = 0;
  state.errorPath = null;
  state.billing = { ...billing, active: null, message: 'Бесплатный план.' };
  await page.locator('.billing-management summary').click();
  await page.locator('#billing-refresh').click();
  await page.waitForFunction(() => document.querySelector('#billing-plan-badge').textContent === 'Бесплатный');
  assert.equal(await page.locator('#billing-usage').isVisible(), false);
  state.billing = { ...billing, active: { ...billing.active, remainingPercent: 0, exhausted: true } };
  await page.locator('#billing-refresh').click();
  await page.waitForFunction(() => document.querySelector('#billing-remaining').textContent === 'Лимит исчерпан');
  assert.equal(await page.locator('#billing-progress').getAttribute('value'), '0');
  interactions.push(`dashboard ${width} ${theme}: local/cloud search, archive/delete, last publication empty state, API errors/retries, free/paid/exhausted limits`);
}

try {
  for (const name of pages) for (const theme of ['dark', 'light']) for (const width of [1440, 768, 390]) {
    const state = name === 'dashboard' ? { delay: 1500 } : {};
    const fixture = await createContext(width, theme, name === 'dashboard', state);
    try {
      const page = await fixture.context.newPage();
      await page.goto(`${origin}/${name}.html`);
      if (name === 'dashboard') {
        assert.equal(await page.locator('#projects-loading').isVisible(), true);
        results.push(await inspect(page, name, width, theme, 'loading'));
        state.delay = 0;
      }
      if (name === 'editor') await page.locator('#editor-form[data-editor-ready=true]').waitFor();
      if (name === 'video') await page.locator('body[data-ready=true]').waitFor();
      if (name === 'index') await page.locator('#cover-png:enabled').waitFor();
      if (name === 'dashboard') await page.locator('.dashboard-main[data-state=empty]').waitFor();
      results.push({ ...await inspect(page, name, width, theme), errors: [...fixture.errors], consoleErrors: [...fixture.responses] });
      console.log(`${name} ${theme} ${width}: width=${results.at(-1).scrollWidth}, overflow=${results.at(-1).overflow.length}, errors=${fixture.errors.length}`);
      if (name === 'auth') await authStates(page, width, theme, fixture, state);
      if (name === 'dashboard') await dashboardStates(page, width, theme, fixture, state);
      if (name === 'index') {
        await page.locator('#quick-file').setInputFiles({ name: 'invalid.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') });
        await page.locator('#quick-status.is-error').waitFor();
        await page.locator('#quick-status').scrollIntoViewIfNeeded();
        results.push(await inspect(page, name, width, theme, 'upload-error'));
        await page.locator('#quick-price').fill('не цена');
        assert.equal(await page.locator('#quick-price').getAttribute('aria-invalid'), 'true');
        await page.locator('#quick-price').fill('4500');
        assert.equal(await page.locator('#quick-price').getAttribute('aria-invalid'), 'false');
        interactions.push(`index ${width} ${theme}: invalid photo, invalid price and recovery`);
      }
      if (name === 'editor') {
        const rail = await page.locator('.studio-command-rail').boundingBox();
        const tabs = await page.locator('.studio-tabs').boundingBox();
        assert.ok(tabs.y >= rail.y && tabs.y + tabs.height <= rail.y + rail.height + 1, 'Tabs must remain inside the tool rail');
        for (const tab of ['content', 'design', 'templates', 'photo']) {
          await page.locator('#tab-' + tab).click();
          assert.equal(await page.locator('#panel-' + tab).isVisible(), true);
        }
        await page.locator('#photo-input').setInputFiles({ name: 'invalid.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') });
        await page.waitForFunction(() => /Не удалось|не поддерж|не является|Поврежд|не удалось/.test(document.querySelector('#file-status').textContent));
        results.push(await inspect(page, name, width, theme, 'upload-error'));
        interactions.push(`editor ${width} ${theme}: tool tabs contained, all inspector panels, invalid photo error`);
      }
      if (name === 'video') {
        await page.locator('#project-input').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
        await page.locator('#toast.visible').waitFor();
        results.push(await inspect(page, name, width, theme, 'import-error'));
        await page.locator('#export').click();
        assert.equal(await page.locator('#export-dialog').isVisible(), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#export-dialog').isVisible(), false);
        interactions.push(`video ${width} ${theme}: invalid project, export dialog, keyboard dismissal`);
      }
      // Exercise the visible theme switch and the language control on every page.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('[data-theme-toggle]').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme === 'dark' ? 'light' : 'dark');
      await page.locator('[data-theme-toggle]').click();
      const menu = page.locator('[data-menu-toggle]');
      if (await menu.count() && await menu.isVisible()) await menu.click();
      await page.locator('.interface-language select').selectOption('kk');
      assert.equal(await page.locator('html').getAttribute('lang'), 'kk');
      if (await menu.count() && await menu.isVisible()) await menu.click();
      results.push(await inspect(page, name, width, theme, 'kazakh'));
      assert.deepEqual(fixture.errors, []);
      assert.deepEqual(fixture.responses, []);
    } finally { await fixture.context.close(); }
  }
  // Contact sheets retain each viewport's proportions, one sheet per page.
  const sheet = await browser.newPage({ viewport: { width: 1560, height: 1120 } });
  for (const name of pages) {
    const cards = [];
    for (const theme of ['dark', 'light']) for (const width of [1440, 768, 390]) {
      const source = (await readFile(resolve(output, `${name}-${theme}-${width}-viewport.png`))).toString('base64');
      cards.push(`<article><h2>${name} · ${theme} · ${width}px</h2><img src="data:image/png;base64,${source}"></article>`);
    }
    await sheet.setContent(`<html><head><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#777;color:white;font:14px system-ui}main{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}article{height:530px;margin:0;background:#444;padding:12px}h2{font-size:13px;margin:0 0 10px}img{width:100%;height:480px;object-fit:contain;object-position:top}</style></head><body><main>${cards.join('')}</main></body></html>`);
    await sheet.screenshot({ path: resolve(output, name + '-contact.png'), fullPage: true });
  }
  await sheet.close();
  await writeFile(resolve(output, 'matrix.json'), JSON.stringify(results, null, 2));
  await writeFile(resolve(output, 'interactions.json'), JSON.stringify(interactions, null, 2));
  assert.ok(results.every(r => r.scrollWidth === r.width && r.overflow.length === 0 && !(r.errors?.length) && !(r.consoleErrors?.length) && r.theme === r.renderedTheme), 'Layout or console regression; see matrix.json');
  console.log(`Redesign passed: ${results.length} rendered states, ${interactions.length} interaction groups.`);
} finally { await browser.close(); }
