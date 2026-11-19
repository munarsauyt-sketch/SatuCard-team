import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

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
