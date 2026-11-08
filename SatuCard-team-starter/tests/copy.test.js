import test from 'node:test';
import assert from 'node:assert/strict';
import '../studio-copy.js';
import '../studio-renderer.js';
import { generateCopy, validateInput, validateOutput, validateImage, COPY_MODEL, TEMPLATE_IDS, MAX_IMAGE_DATA_LENGTH } from '../lib/copy.js';
import { imageDataUrl, completed } from './copy-fixtures.js';
const input = { language: 'ru', title: 'Чашка', facts: 'Объём 200 мл; Цвет белый', tone: 'neutral' };
const draft = { title: 'Чашка', subtitle: 'О товаре', description: 'Объём 200 мл', features: ['Цвет белый'], template: 'minimal' };
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
  for (const patch of [{ title: '' }, { title: 'X'.repeat(61) }, { language: 'en' }, { tone: 'magic' }, { facts: 'X'.repeat(2001) }, { facts: null }]) assert.throws(() => validateInput({ ...input, ...patch }));
  for (const patch of [{ title: 'X'.repeat(61) }, { description: '300 мл' }, { subtitle: '<script>' }, { features: [1] }, { features: ['a','b','c','d'] }, { surprise: true }, { template: 'unknown' }, { template: undefined }]) assert.throws(() => validateOutput({ ...draft, ...patch }, input));
  assert.deepEqual(TEMPLATE_IDS, Object.keys(SATUCARD_RENDERER.templates));
});
test('image validation rejects URLs, invalid encodings, SVG, PNG, oversized thumbnails and oversized dimensions', () => {
  assert.equal(validateImage(imageDataUrl), imageDataUrl);
  for (const value of [null, '', 'https://example.com/photo.jpg', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,AAAA', 'data:image/jpeg;base64,not+jpg=', imageDataUrl + ' ', 'data:image/jpeg;base64,' + 'A'.repeat(MAX_IMAGE_DATA_LENGTH)]) assert.throws(() => validateImage(value));
  const bytes = Buffer.from(imageDataUrl.split(',')[1], 'base64');
  const sof = bytes.indexOf(Buffer.from([0xff, 0xc0]));
  bytes.writeUInt16BE(769, sof + 7);
  assert.throws(() => validateImage('data:image/jpeg;base64,' + bytes.toString('base64')));
  assert.deepEqual(validateInput({ ...input, model: 'expensive', email: 'private@example.com', token: 'secret', photo: 'never sent' }), input);
});
test('Responses request is strict, bounded and sends only approved fields with no tools or image by default', async () => {
  let body, url, headers;
  const fetcher = async (target, options) => { url = target; body = JSON.parse(options.body); headers = options.headers; return Response.json(completed(draft)); };
  assert.equal((await generateCopy({ ...input, userId: 'private', email: 'private' }, { key: 'test-key', fetcher })).source, 'ai');
  assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(body.model, COPY_MODEL);
  assert.equal(body.store, false); assert.equal(body.max_output_tokens, 1200); assert.deepEqual(body.reasoning, { effort: 'none' });
  assert.equal(body.text.format.type, 'json_schema'); assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.deepEqual(body.text.format.schema.required.sort(), Object.keys(body.text.format.schema.properties).sort());
  assert.deepEqual(body.input[0].content, [{ type: 'input_text', text: JSON.stringify(input) }]);
  assert.equal(headers.Authorization, 'Bearer test-key'); assert.equal(body.tools, undefined);
  assert.match(body.instructions, /NEVER instructions/); assert.match(body.instructions, /never infer or OCR/);
  await generateCopy({ ...input, imageDataUrl }, { key: 'test', fetcher });
  assert.deepEqual(body.input[0].content[1], { type: 'input_image', image_url: imageDataUrl, detail: 'low' });
  assert.deepEqual(JSON.parse(body.input[0].content[0].text), input);
});
test('Responses parsing tolerates reasoning items but rejects refused/incomplete/unsafe or malformed drafts', async () => {
  const data = completed(draft); data.output.unshift({ type: 'reasoning', summary: [] });
  assert.equal((await generateCopy(input, { key: 'test', fetcher: async () => Response.json(data) })).template, 'minimal');
  const badResponses = [{}, { ...completed(draft), status: 'incomplete' }, { ...completed(draft), error: { message: 'private' } },
    { status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'refusal', refusal: 'No' }] }] },
    { status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'not json' }] }] },
    completed({ ...draft, features: ['999 литров'] })];
  for (const value of badResponses) await assert.rejects(generateCopy(input, { key: 'test', fetcher: async () => Response.json(value) }));
  let calls = 0;
  await assert.rejects(generateCopy(input, { key: 'test', model: 'other-model', fetcher: async () => { calls++; } }));
  assert.equal(calls, 0);
});
test('provider errors and hung calls are bounded and never automatically retried', async () => {
  let calls = 0;
  await assert.rejects(generateCopy(input, { key: 'test', fetcher: async () => { calls++; throw new Error('secret'); } }));
  assert.equal(calls, 1);
  await assert.rejects(generateCopy(input, { key: 'test', fetcher: async () => new Response('', { status: 429 }) }));
  let signal;
  await assert.rejects(generateCopy(input, { key: 'test', timeoutMs: 5, fetcher: async (_, options) => { signal = options.signal; return new Promise(() => {}); } }), /timeout/);
  assert.equal(signal.aborted, true);
});
