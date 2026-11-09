import { parseCompletion, parseProviderText, postProviderJson, providerMessages } from './provider-http.js';

const MISTRAL_MODEL = 'ministral-8b-latest';
const CLOUDFLARE_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const COHERE_MODEL = 'command-a-03-2025';
const MAX_OUTPUT_TOKENS = 1600;

async function mistral(request, options) {
  return parseCompletion(await postProviderJson('https://api.mistral.ai/v1/chat/completions', {
    model: MISTRAL_MODEL, max_tokens: MAX_OUTPUT_TOKENS, temperature: 0.2,
    messages: providerMessages(request, true),
    response_format: { type: 'json_schema', json_schema: { name: 'satucard_chat', strict: true, schema: request.schema } }
  }, options));
}

async function cloudflare(request, options) {
  const { accountId } = options;
  if (!/^[a-f0-9]{32}$/i.test(accountId ?? '')) throw new Error('Provider unavailable');
  const result = await postProviderJson(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`, {
    model: CLOUDFLARE_MODEL, max_completion_tokens: MAX_OUTPUT_TOKENS, temperature: 0.2,
    messages: providerMessages(request, true),
    chat_template_kwargs: { enable_thinking: false },
    response_format: { type: 'json_object' },
    store: false
  }, options);
  return parseCompletion(result);
}

async function cohere(request, options) {
  // Cohere's schema dialect omits string and array length constraints.
  // Ask for JSON here and let the shared sAI validator enforce the full contract.
  const result = await postProviderJson('https://api.cohere.com/v2/chat', {
    model: COHERE_MODEL, max_tokens: MAX_OUTPUT_TOKENS, temperature: 0.2,
    messages: providerMessages(request, true),
    response_format: { type: 'json_object' }
  }, options);
  const content = result?.message?.content;
  if (result?.finish_reason !== 'COMPLETE' || result.message?.role !== 'assistant' || result.message.tool_calls?.length ||
      !Array.isArray(content) || content.length !== 1 || content[0]?.type !== 'text') throw new Error('Incomplete response');
  return parseProviderText(content[0].text);
}

export const freeProviderAdapters = Object.freeze({ mistral, cloudflare, cohere });
