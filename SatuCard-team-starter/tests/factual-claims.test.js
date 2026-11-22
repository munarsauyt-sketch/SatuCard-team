import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSupportedClaims } from '../lib/factual-claims.js';
import { validateChatInput, validateChatOutput } from '../lib/chat.js';

const card = { title: 'Футболка', subtitle: '', description: '', features: [], template: 'studio' };
const input = { message: 'Подготовь описание', history: [], card, facts: 'Материал: хлопок', language: 'ru', tone: 'neutral' };
const response = description => ({ reply: 'Предлагаю вариант.', proposal: { ...card, description } });

test('unconfirmed catalog claims are rejected in RU, KZ and English', () => {
  for (const claim of ['Водонепроницаемая ткань', 'Су өткізбейтін мата', 'Waterproof fabric', 'Гипоаллергенная ткань', 'Түпнұсқа тауар', 'Бесплатная доставка', 'Кепілдік бар', 'Genuine leather']) {
    assert.throws(() => validateChatOutput(response(claim), input), /Unsupported product claim/);
  }
  assert.doesNotThrow(() => validateChatOutput(response('Мақта мата'), input));
  assert.doesNotThrow(() => validateChatOutput(response('Спокойный повседневный стиль'), input));
});

test('negative seller facts do not authorize positive claims or the reverse', () => {
  assert.throws(() => assertSupportedClaims('Водонепроницаемая ткань', 'Ткань не водонепроницаемая'), /Unsupported product claim/);
  assert.throws(() => assertSupportedClaims('Сертификат бар', 'Сертификат жоқ'), /Unsupported product claim/);
  assert.throws(() => assertSupportedClaims('Без гарантии', 'Гарантия есть'), /Unsupported product claim/);
  assert.doesNotThrow(() => assertSupportedClaims('Су өткізбейтін мата', 'Водонепроницаемая ткань'));
  assert.doesNotThrow(() => assertSupportedClaims('Гарантия отсутствует', 'Гарантия отсутствует'));
});

test('shown card price is preserved and grounded while hidden prices remain private', () => {
  const clean = validateChatInput({ ...input, card: { ...card, price: 4900, currency: 'KZT', showPrice: true } });
  assert.equal(clean.card.price, 4900);
  assert.doesNotThrow(() => validateChatOutput(response('Цена 4900 ₸'), clean));
  assert.throws(() => validateChatOutput(response('Цена 4900 ₸'), { ...clean, card: { ...clean.card, showPrice: false } }), /Unsupported numeric claim/);
  for (const price of ['4900', NaN, Infinity, -1, 12.345]) assert.throws(() => validateChatInput({ ...input, card: { ...card, price } }), /Invalid price/);
  assert.throws(() => validateChatInput({ ...input, card: { ...card, price: 4900, currency: 'USD' } }), /Invalid currency/);
  assert.deepEqual(validateChatInput(input), input);
});
