import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAnyModel } from '../lib/anymodel.js';

const input = {
  message: 'Предложи короткий ответ.',
  card: { title: 'Демо-чашка' },
  facts: 'Материал: керамика.',
  language: 'ru'
};
const request = {
  input: { ...input, imageDataUrl: 'example-photo', imageConsent: true, apiKey: 'example-secret' },
  instructions: 'Use only verified facts.',
  schema: { type: 'object', required: ['reply', 'proposal'] }
};
const reply = { reply: 'Подойдёт спокойное оформление.', proposal: null };

test('AnyModel requests a bounded text completion on the selected Sol route', async () => {
  let calls = 0;
  const result = await generateAnyModel(request, {
    key: 'example-server-key',
    fetcher: async (url, init) => {
      calls++;
      assert.equal(url, 'https://anymodel.org/v1/chat/completions');
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, 'Bearer example-server-key');
      const body = JSON.parse(init.body);
      assert.equal(body.model, 'cx/gpt-6.1-sol');
      assert.equal(body.stream, false);
      assert.equal(body.max_completion_tokens, 1800);
      assert.equal(body.reasoning_effort, 'low');
      assert.equal(body.tools, undefined);
      assert.match(body.messages[0].content, /exactly one JSON object/);
      assert.deepEqual(JSON.parse(body.messages[1].content), input);
      return Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(reply) } }] });
    }
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, reply);
});

test('AnyModel does not retry a balance failure or expose its response body', async () => {
  let calls = 0;
  await assert.rejects(generateAnyModel(request, {
    key: 'example-server-key',
    fetcher: async () => {
      calls++;
      return Response.json({ error: 'example-provider-internal-message' }, { status: 402 });
    }
  }), error => error.message === 'Provider unavailable' && error.providerStatus === 402);
  assert.equal(calls, 1);
});
