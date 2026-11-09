import test from 'node:test';
import assert from 'node:assert/strict';
import { validateChatInput, validateChatOutput } from '../lib/chat.js';

const input = (facts = '', extra = {}) => validateChatInput({
  message: 'Собери карточку',
  card: { title: 'Logitech G435', subtitle: '', description: '', features: [], template: 'neon' },
  facts, language: 'ru', tone: 'neutral', ...extra
});
const reply = (text, context) => validateChatOutput({ reply: text, proposal: null }, context);

test('a model identifier can be repeated, while its digits cannot become a quantity', () => {
  assert.doesNotThrow(() => reply('Оформим Logitech G435.', input()));
  assert.throws(() => reply('Время работы 435 часов.', input()), /Unsupported numeric claim/);
  assert.doesNotThrow(() => reply('Время работы 435 часов.', input('Время работы: 435 часов')));
  const context = input('', { message: 'Помоги с Sony WH-1000XM5' });
  assert.doesNotThrow(() => reply('Подойдёт оформление для WH-1000XM5.', context));
  assert.throws(() => reply('Аккумулятор 1000 мАч.', context), /Unsupported numeric claim/);
});

test('a measurement keeps its unit and property across Russian and Kazakh', () => {
  const context = input('Масса 200 г. Ширина 25 см. Гарантия 2 года.', { language: 'kk' });
  assert.doesNotThrow(() => reply('Салмағы 200 г. Ені 25 см. Кепілдік 2 жыл.', context));
  for (const invented of ['200 часов работы.', 'Масса 200 мл.', 'Высота 25 см.', 'Время работы 2 года.']) {
    assert.throws(() => reply(invented, context), /Unsupported numeric claim/);
  }
  const proposal = { title: 'Logitech G435', subtitle: '', description: 'Высота 25 см.', features: [], template: 'neon' };
  assert.throws(() => validateChatOutput({ reply:'Черновик готов.', proposal }, context), /Unsupported numeric claim/);
});

test('instructional numbering is allowed but previous draft facts are untrusted', () => {
  const context = input('', { previousProposal: { title:'Logitech G435', subtitle:'', description:'Время работы 99 часов.', features:[], template:'neon' } });
  assert.doesNotThrow(() => reply('1. Загрузите фото.\n2. Добавьте название.', context));
  assert.throws(() => reply('1. Время работы 99 часов.', context), /Unsupported numeric claim/);
});
