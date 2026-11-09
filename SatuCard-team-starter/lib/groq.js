import { parseCompletion, postProviderJson, providerMessages } from './provider-http.js';

export const GROQ_MODEL = 'openai/gpt-oss-20b';

export async function generateGroq(request, options) {
  return parseCompletion(await postProviderJson('https://api.groq.com/openai/v1/chat/completions', {
    model: GROQ_MODEL, max_completion_tokens: 1800, reasoning_effort: 'low', reasoning_format: 'hidden',
    messages: providerMessages(request),
    response_format: { type: 'json_schema', json_schema: { name: 'satucard_chat', strict: true, schema: request.schema } }
  }, options));
}
