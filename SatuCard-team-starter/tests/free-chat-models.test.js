import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  FREE_CHAT_CATALOG,
  FREE_CHAT_DEFAULT_MODEL,
  FREE_CHAT_MODELS,
  generateFreeChat,
  parseFreeChatCompletion
} from '../lib/free-chat-models.js';
import { numericEvidence } from '../lib/numeric-claims.js';
import { GET as chatStatus, POST as chatPost } from '../api/chat.js';

const sampleRequest = {
  input: {
    message: 'привет',
    history: [],
    card: { title: 'Беспроводные наушники', subtitle: '', description: '', features: ['До 36 ч без подзарядки'], template: 'noir' },
    facts: '',
    language: 'ru',
    tone: 'neutral'
  },
  instructions: 'Reply concisely.',
  schema: { type: 'object', required: ['reply', 'proposal'] }
};

test('free chat catalog includes all 9 verified 0-cost models and excludes 402 subscription-locked slugs', () => {
  assert.equal(FREE_CHAT_MODELS.length, 9);
  assert.equal(FREE_CHAT_DEFAULT_MODEL, 'free/deepseek-v4.1-flash');
  assert.ok(FREE_CHAT_MODELS.includes('free/gemini-4-hydrogen'));
  assert.ok(FREE_CHAT_MODELS.includes('free/qwen-3.8-max'));
  assert.ok(!FREE_CHAT_MODELS.includes('free/hy4-flash'), '402 subscription-only model must not be listed');
  assert.ok(!FREE_CHAT_MODELS.includes('free/claude-sonnet-4.6'), '402 subscription-only model must not be listed');
  for (const model of FREE_CHAT_CATALOG) {
    assert.doesNotMatch(model.label, /apinex/i);
  }
});

test('parseFreeChatCompletion normalizes markdown fences, prose-wrapped JSON, missing proposal and plain greetings', () => {
  const mk = (content, finish_reason = 'stop') => ({
    choices: [{ finish_reason, message: { role: 'assistant', content } }]
  });

  assert.deepEqual(
    parseFreeChatCompletion(mk('```json\n{"reply":"Привет! Чем помочь?","proposal":null}\n```')),
    { reply: 'Привет! Чем помочь?', proposal: null }
  );

  assert.deepEqual(
    parseFreeChatCompletion(mk('Вот ответ:\n{"reply":"Готово","extra":123}')),
    { reply: 'Готово', proposal: null }
  );

  assert.deepEqual(
    parseFreeChatCompletion(mk('Привет! Расскажите о товаре.'), { allowPlainReply: true }),
    { reply: 'Привет! Расскажите о товаре.', proposal: null }
  );

  assert.throws(() => parseFreeChatCompletion(mk('Привет!'), { allowPlainReply: false }), /Invalid response/);
  assert.throws(() => parseFreeChatCompletion({
    choices: [{ finish_reason: 'content_filter', message: { role: 'assistant', content: '{"reply":"x","proposal":null}' } }]
  }), /Incomplete response/);
});

test('generateFreeChat retries once without response_format on HTTP 400 and never retries 429', async () => {
  const bodies = [];
  const res = await generateFreeChat(sampleRequest, {
    key: 'test-key',
    model: 'free/deepseek-v4.1-flash',
    fetcher: async (_url, init) => {
      const parsed = JSON.parse(init.body);
      bodies.push(parsed);
      if (bodies.length === 1) return new Response('{}', { status: 400 });
      return Response.json({
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{"reply":"Привет!","proposal":null}' } }]
      });
    }
  });
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0].response_format, { type: 'json_object' });
  assert.equal(bodies[1].response_format, undefined);
  assert.deepEqual(res, { reply: 'Привет!', proposal: null });

  let calls429 = 0;
  await assert.rejects(generateFreeChat(sampleRequest, {
    key: 'test-key',
    model: 'free/deepseek-v4.1-flash',
    fetcher: async () => { calls429++; return new Response('{}', { status: 429 }); }
  }), err => err.providerStatus === 429);
  assert.equal(calls429, 1);
});

test('numericEvidence treats "без подзарядки" as runtime while still blocking fabricated numbers and wrong properties', () => {
  const check = numericEvidence(['Беспроводные наушники', 'До 36 ч без подзарядки']);
  assert.doesNotThrow(() => check('Автономность до 36 часов без подзарядки.'));
  assert.doesNotThrow(() => check('До 36 ч автономной работы.'));
  assert.throws(() => check('Автономность до 40 часов.'), /Unsupported numeric claim/);
  assert.throws(() => check('Зарядка 36 часов.'), /Unsupported numeric claim/);
});

test('api/chat serves free models without exposing APInex branding while keeping paid models strictly gated', async t => {
  const keys = ['APINEX_API_KEY', 'SAI_FREE_MODELS_ENABLED', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'ANYMODEL_API_KEY', 'SAI_PRODUCTION_ANYMODEL_ENABLED', 'VERCEL_ENV'];
  const prev = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const origFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = origFetch;
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  process.env.APINEX_API_KEY = 'test-free-key';
  delete process.env.SAI_FREE_MODELS_ENABLED;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;

  const getRes = await chatStatus(new Request('https://satucard.test/api/chat'));
  assert.equal(getRes.status, 200);
  const getText = await getRes.text();
  assert.doesNotMatch(getText, /apinex/i, 'GET /api/chat must never reveal upstream gateway name');
  const getJson = JSON.parse(getText);
  assert.equal(getJson.available, true);
  assert.equal(getJson.hasAccess, true);
  assert.equal(getJson.freeChat, true);
  assert.equal(getJson.models.length, 9);
  assert.equal(getJson.defaultModel.id, 'free/deepseek-v4.1-flash');

  // Guest POST to a free model succeeds and never leaks vendor name
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.apinex.bond/v1/chat/completions');
    assert.equal(init.headers.Authorization, 'Bearer test-free-key');
    return Response.json({
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '```json\n{"reply":"Привет! Чем помочь с карточкой?","proposal":null}\n```' } }]
    });
  };
  const okRes = await chatPost(new Request('https://satucard.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
    body: JSON.stringify({
      message: 'привет',
      history: [],
      card: { title: 'Наушники', subtitle: '', description: '', features: [], template: 'noir' },
      facts: '',
      language: 'ru',
      tone: 'neutral',
      selectedProvider: 'sai_free',
      selectedModel: 'free/deepseek-v4.1-flash'
    })
  }));
  assert.equal(okRes.status, 200);
  const okText = await okRes.text();
  assert.doesNotMatch(okText, /apinex/i);
  const okJson = JSON.parse(okText);
  assert.equal(okJson.reply, 'Привет! Чем помочь с карточкой?');
  assert.equal(okJson.providerUsed, 'sai_free');
  assert.equal(okJson.modelUsed, 'free/deepseek-v4.1-flash');

  // Guest POST attempting to use a paid AnyModel slug is strictly denied (403)
  const deniedRes = await chatPost(new Request('https://satucard.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.11' },
    body: JSON.stringify({
      message: 'привет',
      history: [],
      card: { title: 'Наушники', subtitle: '', description: '', features: [], template: 'noir' },
      facts: '',
      language: 'ru',
      tone: 'neutral',
      selectedProvider: 'anymodel',
      selectedModel: 'cx/gpt-6.1-sol'
    })
  }));
  assert.equal(deniedRes.status, 403);
  assert.doesNotMatch(await deniedRes.text(), /apinex/i);

  // Error response on upstream 429 also never leaks vendor name
  globalThis.fetch = async () => new Response('{"error":{"message":"APInex rate limit"}}', { status: 429 });
  const rateRes = await chatPost(new Request('https://satucard.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.12' },
    body: JSON.stringify({
      message: 'привет',
      history: [],
      card: { title: 'Наушники', subtitle: '', description: '', features: [], template: 'noir' },
      facts: '',
      language: 'ru',
      tone: 'neutral',
      selectedProvider: 'sai_free',
      selectedModel: 'free/deepseek-v4.1-flash'
    })
  }));
  assert.equal(rateRes.status, 429);
  assert.doesNotMatch(await rateRes.text(), /apinex/i);

  // Client UI files must never mention APInex
  const chatJs = await readFile(new URL('../studio-chat.js', import.meta.url), 'utf8');
  const editorHtml = await readFile(new URL('../editor.html', import.meta.url), 'utf8');
  assert.doesNotMatch(chatJs, /apinex/i);
  assert.doesNotMatch(editorHtml, /apinex/i);
});
