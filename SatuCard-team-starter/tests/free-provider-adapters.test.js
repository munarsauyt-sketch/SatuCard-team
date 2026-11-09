import test from 'node:test';
import assert from 'node:assert/strict';
import { freeProviderAdapters } from '../lib/free-provider-adapters.js';

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'proposal'],
  properties: { reply: { type: 'string', maxLength: 1400 }, proposal: { type: 'null' } }
};
const input = {
  message: 'Предложи идею для карточки', history: [], card: { title: 'Чашка' },
  facts: 'Масса 200 г', language: 'ru', tone: 'neutral'
};
const request = {
  input: { ...input, imageDataUrl: 'test-photo', imageConsent: true, fallbackProvider: 'test-only' },
  instructions: 'Keep claims grounded.', schema
};
const accountId = 'a'.repeat(32);
const reply = { reply: 'Выберите спокойное оформление.', proposal: null };
const completion = { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(reply) } }] };

const providers = {
  mistral: {
    url: 'https://api.mistral.ai/v1/chat/completions', model: 'ministral-8b-latest', response: completion,
    format: { type: 'json_schema', json_schema: { name: 'satucard_chat', strict: true, schema } }
  },
  cloudflare: {
    url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
    model: '@cf/google/gemma-4-26b-a4b-it', response: completion, format: { type: 'json_object' }
  },
  cohere: {
    url: 'https://api.cohere.com/v2/chat', model: 'command-a-03-2025', format: { type: 'json_object' },
    response: { finish_reason: 'COMPLETE', message: { role: 'assistant', content: [{ type: 'text', text: JSON.stringify(reply) }] } }
  }
};

for (const [id, spec] of Object.entries(providers)) {
  test(`${id} sends bounded text to the fixed vendor endpoint and returns its parsed reply`, async () => {
    let calls = 0;
    const result = await freeProviderAdapters[id](request, {
      key: 'server-key', accountId,
      fetcher: async (url, options) => {
        calls++;
        assert.equal(url, spec.url);
        assert.equal(options.method, 'POST');
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers.Authorization, 'Bearer server-key');
        assert.equal(options.signal.aborted, false);
        const body = JSON.parse(options.body);
        assert.equal(body.model, spec.model);
        assert.equal(body.max_tokens ?? body.max_completion_tokens, 1600);
        assert.equal(body.tools, undefined);
        assert.deepEqual(body.response_format, spec.format);
        assert.deepEqual(body.messages.map(message => message.role), ['system', 'user']);
        assert.ok(body.messages[0].content.includes(JSON.stringify(schema)));
        assert.deepEqual(JSON.parse(body.messages[1].content), input);
        if (id === 'cloudflare') {
          assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
          assert.equal(body.store, false);
        }
        return Response.json(spec.response);
      }
    });
    assert.deepEqual(result, reply);
    assert.equal(calls, 1);
  });

  test(`${id} reports quota without leaking the response or retrying`, async () => {
    let calls = 0;
    await assert.rejects(freeProviderAdapters[id](request, {
      key: 'server-key', accountId,
      fetcher: async () => { calls++; return Response.json({ message: 'private response' }, { status: 429 }); }
    }), error => error.message === 'Provider unavailable' && error.providerStatus === 429);
    assert.equal(calls, 1);
  });
}

test('Cloudflare requires a real-format account identifier before sending a request', async () => {
  let calls = 0;
  await assert.rejects(freeProviderAdapters.cloudflare(request, {
    key: 'server-key', accountId: '../another',
    fetcher: async () => { calls++; return Response.json(completion); }
  }), /Provider unavailable/);
  assert.equal(calls, 0);
});

test('stalled response body is aborted on timeout', async () => {
  let signal;
  await assert.rejects(freeProviderAdapters.mistral(request, {
    key: 'server-key', timeoutMs: 20,
    fetcher: async (_url, options) => {
      signal = options.signal;
      return { ok: true, json: () => new Promise(() => {}) };
    }
  }), /Provider timeout/);
  assert.equal(signal.aborted, true);
});

test('refusals, tool requests, truncation and invalid JSON cannot be accepted as a reply', async () => {
  const openaiMessage = { role: 'assistant', content: JSON.stringify(reply) };
  for (const [adapter, response] of [
    ['mistral', { choices: [{ finish_reason: 'length', message: openaiMessage }] }],
    ['mistral', { choices: [{ finish_reason: 'stop', message: { ...openaiMessage, refusal: 'blocked' } }] }],
    ['cloudflare', { choices: [{ finish_reason: 'stop', message: { ...openaiMessage, tool_calls: [{}] } }] }],
    ['cloudflare', { choices: [{ finish_reason: 'stop', message: { ...openaiMessage, content: '{broken' } }] }],
    ['cohere', { finish_reason: 'MAX_TOKENS', message: providers.cohere.response.message }],
    ['cohere', { ...providers.cohere.response, message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'private' }] } }]
  ]) {
    await assert.rejects(freeProviderAdapters[adapter](request, {
      key: 'server-key', accountId, fetcher: async () => Response.json(response)
    }), /Incomplete response|Invalid response/);
  }
});
