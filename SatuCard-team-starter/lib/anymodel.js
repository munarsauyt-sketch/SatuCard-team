import { parseCompletion, postProviderJson, providerMessages } from './provider-http.js';

export const ANYMODEL_MODEL = 'cx/gpt-6.1-sol';

export async function generateAnyModel(request, options) {
  return parseCompletion(await postProviderJson('https://anymodel.org/v1/chat/completions', {
    model: ANYMODEL_MODEL,
    messages: providerMessages(request, true),
    max_completion_tokens: 1800,
    reasoning_effort: 'low',
    stream: false
  }, options));
}
