import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

async function publishedCard(overrides = {}, language = 'ru') {
  const dom = new JSDOM(source('card.html'), {
    url: 'https://satucard.test/card.html?id=card-language-test', runScripts: 'outside-only'
  });
  const w = dom.window;
  w.localStorage.setItem('satucard-interface-language', language);
  w.fetch = async () => ({ ok: true, json: async () => ({
    title: 'Жейде Cotton', price: 4900, oldPrice: null, imageUrl: '/photo.jpg',
    contactUrl: 'https://wa.me/70000000000', ...overrides
  }) });
  w.eval(source('card.js'));
  w.eval(source('interface-language.js'));
  await new Promise(setImmediate);
  return { dom, w, contact: w.document.querySelector('#card-whatsapp-link,#card-contact-link') };
}

test('WhatsApp message follows interface language on load and after switching both ways', async () => {
  const { dom, w, contact } = await publishedCard({}, 'kk');
  try {
    const message = () => new URL(contact.href).searchParams.get('text');
    assert.match(message(), /^Сәлеметсіз бе!/);
    assert.match(message(), /Жейде Cotton/);
    assert.match(message(), /4\s900 ₸/);
    assert.match(message(), /api\/share\?id=card-language-test/);
    assert.match(contact.textContent, /WhatsApp арқылы/);
    w.SATUCARD_LANGUAGE.setLanguage('ru');
    assert.match(message(), /^Здравствуйте!/);
    assert.equal(contact.textContent, 'Написать в WhatsApp ↗');
    w.SATUCARD_LANGUAGE.setLanguage('kk');
    assert.match(message(), /^Сәлеметсіз бе!/);
    assert.equal(w.document.querySelector('#card-title').textContent, 'Жейде Cotton');
  } finally { dom.window.close(); }
});

test('WhatsApp links preserve a seller-supplied message in either language', async () => {
  for (const text of ['Свяжитесь со мной по заказу №7', '']) {
    const custom = new URL('https://api.whatsapp.com/send?phone=70000000000');
    custom.searchParams.set('text', text);
    const { dom, w, contact } = await publishedCard({ contactUrl: custom.href }, 'kk');
    try {
      assert.equal(new URL(contact.href).searchParams.get('text'), text);
      w.SATUCARD_LANGUAGE.setLanguage('ru');
      assert.equal(new URL(contact.href).searchParams.get('text'), text);
    } finally { dom.window.close(); }
  }
});

test('hidden prices stay out of WhatsApp and other seller contact links retain their destination', async () => {
  const hidden = await publishedCard({ showPrice: false });
  try {
    assert.doesNotMatch(new URL(hidden.contact.href).searchParams.get('text'), /4900|4\s900|₸/);
  } finally { hidden.dom.window.close(); }
  const other = await publishedCard({ contactUrl: 'https://instagram.com/shop/' }, 'kk');
  try {
    assert.equal(other.contact.href, 'https://instagram.com/shop/');
    assert.equal(other.contact.textContent, 'Сатушымен байланысу ↗');
    other.w.SATUCARD_LANGUAGE.setLanguage('ru');
    assert.equal(other.contact.textContent, 'Связаться с продавцом ↗');
  } finally { other.dom.window.close(); }
});
