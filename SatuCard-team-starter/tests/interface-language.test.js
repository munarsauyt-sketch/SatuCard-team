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
