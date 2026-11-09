import assert from 'node:assert/strict';
import test from 'node:test';
import { creditProviderAdapters } from '../lib/credit-provider-adapters.js';

const request = {
  input: { message: 'Сократи заголовок' },
  instructions: 'Reply in Russian.',
  schema: { type: 'object', properties: { reply: { type: 'string' } }, required: ['reply'], additionalProperties: false }
};
const output = { reply: 'Сокращённый заголовок' };

function completion(override = {}) {
  return Response.json({
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(output), ...override } }]
  });
}

test('trial adapters use only their official endpoint, fixed model and text messages', async () => {
  for (const [provider, endpoint, model, format] of [
    ['alibaba', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', 'qwen3.8-flash', 'json_object'],
    ['scaleway', 'https://api.scaleway.ai/v1/chat/completions', 'qwen3.6-35b-a3b', 'json_schema']
  ]) {
    let calls = 0;
    const result = await creditProviderAdapters[provider](request, {
      key: 'test-only',
      fetcher: async (url, options) => {
        calls++;
        const body = JSON.parse(options.body);
        assert.equal(url, endpoint);
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers.Authorization, 'Bearer test-only');
        assert.equal(body.model, model);
        assert.equal(body.response_format.type, format);
        assert.equal(body.tools, undefined);
        assert.equal(body.max_tokens, 1800);
        assert.deepEqual(body.messages[1], { role: 'user', content: JSON.stringify(request.input) });
        if (provider === 'alibaba') {
          assert.equal(body.enable_thinking, false);
          assert.match(body.messages[0].content, /JSON object/);
        } else {
          assert.equal(body.reasoning_effort, 'none');
          assert.deepEqual(body.response_format.json_schema.schema, request.schema);
        }
        return completion();
      }
    });
    assert.deepEqual(result, output);
    assert.equal(calls, 1);
  }
});

test('trial adapters preserve provider HTTP status and reject malformed or tool responses', async () => {
  for (const adapter of Object.values(creditProviderAdapters)) {
    await assert.rejects(adapter(request, {
      key: 'test-only',
      fetcher: async () => new Response('internal details', { status: 429 })
    }), { message: 'Provider unavailable', providerStatus: 429 });
    for (const invalid of [{ content: 'not JSON' }, { refusal: 'Blocked' }, { tool_calls: [{ id: 'test' }] }]) {
      await assert.rejects(adapter(request, { key: 'test-only', fetcher: async () => completion(invalid) }));
    }
  }
});

test('trial provider times out and aborts an unresponsive request', async () => {
  let signal;
  await assert.rejects(creditProviderAdapters.scaleway(request, {
    key: 'test-only',
    timeoutMs: 10,
    fetcher: async (_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    }
  }), { message: 'Provider timeout' });
  assert.equal(signal.aborted, true);
});
