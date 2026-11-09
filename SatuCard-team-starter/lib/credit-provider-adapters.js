import { parseCompletion, postProviderJson, providerMessages } from './provider-http.js';

const ALIBABA_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const SCALEWAY_ENDPOINT = 'https://api.scaleway.ai/v1/chat/completions';

export const creditProviderAdapters = Object.freeze({
  async alibaba(request, options) {
    // The Singapore endpoint is eligible for the new-account quota. The owner's
    // Free Quota Only setting, not the API request, controls billing after it.
    return parseCompletion(await postProviderJson(ALIBABA_ENDPOINT, {
      model: 'qwen3.8-flash',
      max_tokens: 1800,
      enable_thinking: false,
      messages: providerMessages(request, true),
      response_format: { type: 'json_object' }
    }, options));
  },
  async scaleway(request, options) {
    return parseCompletion(await postProviderJson(SCALEWAY_ENDPOINT, {
      model: 'qwen3.6-35b-a3b',
      max_tokens: 1800,
      reasoning_effort: 'none',
      messages: providerMessages(request),
      response_format: { type: 'json_schema', json_schema: { name: 'satucard_chat', schema: request.schema } }
    }, options));
  }
});
