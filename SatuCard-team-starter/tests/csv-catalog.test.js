import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

function parse(source) {
  const dom = new JSDOM('<body></body>', { runScripts: 'outside-only' });
  try {
    dom.window.eval(readFileSync(new URL('../studio-workflow.js', import.meta.url), 'utf8'));
    return JSON.parse(JSON.stringify(dom.window.SATUCARD_WORKFLOW.parseCatalogCsv(source)));
  } finally { dom.window.close(); }
}
test('catalog preserves fractional KZT prices and supports quoted delimiters, quotes and newlines', () => {
  const rows = parse('\uFEFFtitle;subtitle;price;badge\r\n"Набор; 2 шт";"Текст ""в кавычках""\nв две строки";"4 990,50 ₸";Хит\r\nТовар;Описание;4990.50;');
  assert.equal(rows[0].title, 'Набор; 2 шт');
  assert.equal(rows[0].subtitle, 'Текст "в кавычках"\nв две строки');
  assert.equal(rows[0].price, 4990.5);
  assert.equal(rows[1].price, 4990.5);
  assert.equal(parse('title,subtitle,price\nТовар,Описание,"4990,50"')[0].price, 4990.5);
});
test('catalog rejects invalid prices and malformed CSV instead of exporting corrupted data', () => {
  for (const price of ['-500', '4.990.50', '4990abc', '9999999999', '1,234', 'Infinity']) {
    assert.throws(() => parse('title;price\nТовар;' + price), /цену/);
  }
  assert.equal(parse('title;price\nТовар;')[0].price, null);
  assert.throws(() => parse('title;price\n"Товар;4990'), /кавычки/);
  assert.throws(() => parse('title;price\n"Товар"x;4990'), /кавычки/);
});
