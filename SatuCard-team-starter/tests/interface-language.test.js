import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

for (const page of ['guide.html', 'video-guide.html']) {
  test(page + ' translates every instruction and accessible label, and restores Russian', () => {
    const html = source(page);
    assert.ok(html.indexOf('guide-translations.js') < html.indexOf('interface-language.js'));
    const dom = new JSDOM(html, { url: 'https://satucard.test/' + page, runScripts: 'outside-only' });
    try {
      const w = dom.window;
      const walker = w.document.createTreeWalker(w.document.body, w.NodeFilter.SHOW_TEXT);
      const texts = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement.closest('script,style,pre,code,kbd')) continue;
        const original = node.textContent.trim();
        if (/[А-Яа-яЁё]/.test(original)) texts.push({ node, original });
      }
      const attributes = [...w.document.querySelectorAll('[alt],[aria-label]')].flatMap(element =>
        ['alt', 'aria-label'].map(name => ({ element, name, original: element.getAttribute(name) }))
          .filter(item => item.original && /[А-Яа-яЁё]/.test(item.original)));
      const title = w.document.title;
      const description = w.document.querySelector('meta[name="description"]').content;
      const examples = [...w.document.querySelectorAll('pre,code')].map(element => element.textContent);
      w.eval(source('guide-translations.js'));
      w.eval(source('interface-language.js'));
      w.SATUCARD_LANGUAGE.setLanguage('kk');
      const dictionary = w.SATUCARD_GUIDE_TRANSLATIONS;
      for (const { node, original } of texts) {
        assert.ok(Object.hasOwn(dictionary, original), 'Missing translation for ' + original);
        assert.equal(node.textContent.trim(), dictionary[original]);
      }
      for (const { element, name, original } of attributes) {
        assert.equal(element.getAttribute(name), dictionary[original]);
      }
      assert.equal(w.document.title, dictionary[title]);
      assert.equal(w.document.querySelector('meta[name="description"]').content, dictionary[description]);
      assert.deepEqual([...w.document.querySelectorAll('pre,code')].map(element => element.textContent), examples);
      w.SATUCARD_LANGUAGE.setLanguage('ru');
      for (const { node, original } of texts) assert.equal(node.textContent.trim(), original);
      for (const { element, name, original } of attributes) assert.equal(element.getAttribute(name), original);
      assert.equal(w.document.title, title);
      assert.equal(w.document.querySelector('meta[name="description"]').content, description);
    } finally { dom.window.close(); }
  });
}

test('video guide theme switch preserves theme in page links and keeps section links local', async () => {
  const dom = new JSDOM(source('video-guide.html'), {
    url: 'https://satucard.test/video-guide.html?theme=light', runScripts: 'outside-only'
  });
  try {
    const w = dom.window;
    w.eval(source('theme.js'));
    await new Promise(setImmediate);
    const toggle = w.document.querySelector('[data-theme-toggle]');
    assert.ok(toggle);
    assert.equal(w.document.documentElement.dataset.theme, 'light');
    toggle.click();
    assert.equal(w.document.documentElement.dataset.theme, 'dark');
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(w.localStorage.getItem('satucard-theme'), 'dark');
    for (const link of w.document.querySelectorAll('a[href]')) {
      const raw = link.getAttribute('href');
      if (raw.startsWith('#')) assert.ok(raw.length > 1);
      else assert.equal(new URL(link.href).searchParams.get('theme'), 'dark');
    }
  } finally { dom.window.close(); }
});

test('interface language round-trips without translating seller input or product details', async () => {
  const dom = new JSDOM('<html lang="ru"><body><header><nav><a>Главная</a></nav></header><button id="upload">Загрузить своё фото</button><input id="product-name" value="Название товара"><div id="card-text-content"><p>Название товара</p></div><div id="status"></div></body></html>', { url: 'https://satucard.test/editor.html', runScripts: 'outside-only' });
  try {
    const w = dom.window;
    w.eval(readFileSync(new URL('../interface-language.js', import.meta.url), 'utf8'));
    const select = w.document.querySelector('.interface-language select');
    select.value = 'kk'; select.dispatchEvent(new w.Event('change'));
    assert.equal(w.document.documentElement.lang, 'kk');
    assert.equal(w.document.getElementById('upload').textContent, 'Өз фотомды жүктеу');
    assert.equal(w.document.getElementById('product-name').value, 'Название товара');
    assert.equal(w.document.getElementById('card-text-content').textContent, 'Название товара');
    w.document.getElementById('status').textContent = 'Сохранено на устройстве';
    await new Promise(setImmediate);
    assert.equal(w.document.getElementById('status').textContent, 'Құрылғыда сақталды');
    select.value = 'ru'; select.dispatchEvent(new w.Event('change'));
    assert.equal(w.document.getElementById('upload').textContent, 'Загрузить своё фото');
    assert.equal(w.document.getElementById('status').textContent, 'Сохранено на устройстве');
  } finally { dom.window.close(); }
});

test('project commands translate while seller titles remain intact after BFCache restoration', async () => {
  const dom = new JSDOM('<html lang="ru"><body><header><nav></nav></header><ul class="local-project-list"><li><a class="project-card-copy" title="Удалить"><strong>Удалить</strong></a><button>Удалить</button></li></ul><ul class="workflow-project-list"><li><span>Открыть</span><button>Открыть</button></li></ul><div class="my-card-body"><strong>Архив</strong></div><div class="publication-actions"><a>Обновить карточку</a></div><div id="dynamic"></div></body></html>', { url: 'https://satucard.test/dashboard.html', runScripts: 'outside-only' });
  try {
    const w = dom.window;
    w.eval(readFileSync(new URL('../interface-language.js', import.meta.url), 'utf8'));
    w.SATUCARD_LANGUAGE.setLanguage('kk');
    const text = selector => w.document.querySelector(selector).textContent;
    assert.equal(text('.local-project-list strong'), 'Удалить');
    assert.equal(w.document.querySelector('.project-card-copy').title, 'Удалить');
    assert.equal(text('.local-project-list button'), 'Жою');
    assert.equal(text('.workflow-project-list span'), 'Открыть');
    assert.equal(text('.workflow-project-list button'), 'Ашу');
    assert.equal(text('.my-card-body strong'), 'Архив');
    assert.equal(text('.publication-actions a'), 'Карточканы жаңарту');
    w.dispatchEvent(new w.PageTransitionEvent('pagehide', { persisted: true }));
    w.document.getElementById('dynamic').textContent = 'Удалить';
    w.dispatchEvent(new w.PageTransitionEvent('pageshow', { persisted: true }));
    assert.equal(text('#dynamic'), 'Жою');
    w.document.getElementById('dynamic').textContent = 'Открыть';
    await new Promise(setImmediate);
    assert.equal(text('#dynamic'), 'Ашу');
    w.SATUCARD_LANGUAGE.setLanguage('ru');
    assert.equal(text('.local-project-list button'), 'Удалить');
    assert.equal(text('#dynamic'), 'Открыть');
  } finally { dom.window.close(); }
});
