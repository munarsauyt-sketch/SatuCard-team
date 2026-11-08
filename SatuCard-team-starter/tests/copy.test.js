import test from 'node:test';
import assert from 'node:assert/strict';
import '../studio-copy.js';
import { generateCopy, validateOutput } from '../lib/copy.js';
const input = { language: 'ru', title: 'Чашка', facts: 'Объём 200 мл; Цвет белый', tone: 'neutral' };
const draft = { title: 'Чашка', subtitle: 'О товаре', description: 'Объём 200 мл', features: ['Цвет белый'] };
test('offline is deterministic, local, faithful and supports all tones/languages', () => {
  for (const language of ['ru', 'kk']) for (const tone of ['neutral', 'friendly', 'premium']) {
    const result = SATUCARD_COPY.offline({ ...input, language, tone });
    assert.equal(result.source, 'offline'); assert.equal(result.title, input.title);
    assert.equal(result.description, input.facts); assert.equal(result.features.length, 2);
  }
  assert.deepEqual(SATUCARD_COPY.offline({ ...input, facts: '' }).features, []);
  assert.equal(SATUCARD_COPY.offline({ ...input, facts: 'X'.repeat(190) }).description, '');
});
test('bad input and unsafe/oversized model output fail closed', () => {
  for (const patch of [{ title: '' }, { title: 'X'.repeat(61) }, { language: 'en' }, { tone: 'magic' }, { facts: 'X'.repeat(2001) }, { facts: null }]) {
    assert.throws(() => SATUCARD_COPY.validate({ ...input, ...patch }));
  }
  for (const patch of [{ title: 'X'.repeat(61) }, { description: '300 мл' }, { subtitle: '<script>' }, { features: [1] }, { features: ['a','b','c','d'] }, { surprise: true }]) assert.throws(() => validateOutput({ ...draft, ...patch }, input));
});
test('provider receives only supplied input and rejects malformed, refused or unfinished output', async () => {
  let body;
  const fetcher = async (url, options) => { body = JSON.parse(options.body); return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(draft) } }] }); };
  assert.equal((await generateCopy(input, { key: 'test', fetcher })).source, 'ai');
  assert.equal(body.store, false); assert.deepEqual(JSON.parse(body.messages[1].content), input);
  for (const data of [{}, { choices: [{ finish_reason: 'length', message: { content: '{}' } }] }, { choices: [{ finish_reason: 'stop', message: { content: 'not json' } }] }]) await assert.rejects(generateCopy(input, { key: 'test', fetcher: async () => Response.json(data) }));
});
test('provider network errors, HTTP errors and hung requests are bounded', async () => {
  await assert.rejects(generateCopy(input, { key: 'test', fetcher: async () => { throw new Error('secret'); } }));
  await assert.rejects(generateCopy(input, { key: 'test', fetcher: async () => new Response('', { status: 429 }) }));
  let signal;
  await assert.rejects(generateCopy(input, { key: 'test', timeoutMs: 5, fetcher: async (_, options) => { signal = options.signal; return new Promise(() => {}); } }), /timeout/);
  assert.equal(signal.aborted, true);
});
