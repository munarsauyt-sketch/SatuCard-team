import test from 'node:test';
import assert from 'node:assert/strict';
import { ANYMODEL_MODEL, ANYMODEL_MODELS, generateAnyModel } from '../lib/anymodel.js';

const request = {
  input: { message: 'Собери карточку', card: { title: 'Кесе' }, facts: 'Керамика', language: 'ru' },
  instructions: 'Use the supplied facts.',
  schema: { type: 'object' }
};
const reply = { reply: 'Уточните цвет.', proposal: null };
const completion = usage => ({
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(reply) } }],
  ...(usage === undefined ? {} : { usage })
});

test('every allowlisted AnyModel model uses the fixed endpoint and preserves the reply contract', async () => {
  assert.equal(ANYMODEL_MODELS.length, 9);
  for (const model of ANYMODEL_MODELS) {
    const result = await generateAnyModel(request, {
      model, key: 'test-key',
      fetcher: async (url, init) => {
        assert.equal(url, 'https://anymodel.org/v1/chat/completions');
        assert.equal(JSON.parse(init.body).model, model);
        return Response.json(completion());
      }
    });
    assert.deepEqual(result, reply);
  }
  let selected;
  await generateAnyModel(request, {
    key: 'test-key',
    fetcher: async (_url, init) => {
      selected = JSON.parse(init.body).model;
      return Response.json(completion());
    }
  });
  assert.equal(selected, ANYMODEL_MODEL);
});

test('unknown model IDs fail before reservation or HTTP', async () => {
  for (const model of ['untrusted/model', 'https://example.com', '', null]) {
    await assert.rejects(generateAnyModel(request, {
      model, key: 'test-key',
      beforeRequest: async () => assert.fail('Unknown models must not reserve usage'),
      fetcher: async () => assert.fail('Unknown models must not call a provider')
    }), /Unsupported model/);
  }
});

test('the adapter awaits a conservative byte-based reservation before HTTP', async () => {
  const calls = [];
  let reserved;
  await generateAnyModel({ ...request, instructions: 'Қазақша 😀'.repeat(100) }, {
    key: 'test-key',
    beforeRequest: async ({ maxTokens }) => {
      await Promise.resolve();
      reserved = maxTokens;
      calls.push('reserved');
    },
    fetcher: async (_url, init) => {
      calls.push('http');
      const body = JSON.parse(init.body);
      assert.ok(reserved >= Buffer.byteLength(JSON.stringify(body.messages), 'utf8') + body.max_completion_tokens);
      return Response.json(completion());
    }
  });
  assert.deepEqual(calls, ['reserved', 'http']);
  const rejected = new Error('Quota denied');
  await assert.rejects(generateAnyModel(request, {
    key: 'test-key', beforeRequest: async () => { throw rejected; },
    fetcher: async () => assert.fail('A denied reservation must prevent HTTP')
  }), error => error === rejected);
});

test('usage is reported before output parsing and reasoning is counted once', async () => {
  const usage = {
    prompt_tokens: 120, completion_tokens: 80, total_tokens: 200,
    completion_tokens_details: { reasoning_tokens: 50 }
  };
  const calls = [];
  await assert.rejects(generateAnyModel(request, {
    key: 'test-key',
    beforeRequest: async () => { calls.push('reserved'); },
    fetcher: async () => {
      calls.push('http');
      const response = completion(usage);
      response.choices[0].message.content = '{invalid json';
      return Response.json(response);
    },
    onUsage: async value => {
      await Promise.resolve();
      assert.deepEqual(value, { inputTokens: 120, outputTokens: 80, totalTokens: 200 });
      calls.push('settled');
    }
  }), /Invalid response/);
  assert.deepEqual(calls, ['reserved', 'http', 'settled']);
});

test('missing or malformed usage leaves the reservation unsettled', async () => {
  for (const usage of [
    undefined, null, {}, { prompt_tokens: '1', completion_tokens: 2, total_tokens: 3 },
    { prompt_tokens: 1, completion_tokens: -1, total_tokens: 0 },
    { prompt_tokens: 1.5, completion_tokens: 2, total_tokens: 3.5 },
    { prompt_tokens: 1, completion_tokens: 2, total_tokens: 4 },
    { prompt_tokens: 1, completion_tokens: 2, total_tokens: Number.MAX_SAFE_INTEGER + 1 }
  ]) {
    assert.deepEqual(await generateAnyModel(request, {
      key: 'test-key',
      fetcher: async () => Response.json(completion(usage)),
      onUsage: async () => assert.fail('Malformed usage must not release reserved quota')
    }), reply);
  }
});
