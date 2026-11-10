import { parseCompletion, postProviderJson, providerMessages } from './provider-http.js';

export const ANYMODEL_MODEL = 'cx/gpt-6.1-sol';
export const ANYMODEL_CATALOG = Object.freeze([
  { id: 'ag/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 1 },
  { id: 'cx/gpt-6-luna', label: 'GPT-6 Luna', tier: 1 },
  { id: 'cc/claude-sonnet-5-5', label: 'Claude Sonnet 5.5', tier: 1 },
  { id: 'cx/gpt-6.1-terra', label: 'GPT-6.1 Terra', tier: 2 },
  { id: 'cx/gpt-6-sol', label: 'GPT-6 Sol', tier: 2 },
  { id: 'cc/claude-opus-4-8', label: 'Claude Opus 4.8', tier: 2 },
  { id: 'cx/gpt-6-astra', label: 'GPT-6 Astra', tier: 3 },
  { id: ANYMODEL_MODEL, label: 'GPT-6.1 Sol', tier: 3 },
  { id: 'cc/claude-opus-5-5', label: 'Claude Opus 5.5', tier: 3 }
].map(Object.freeze));
export const ANYMODEL_MODELS = Object.freeze(ANYMODEL_CATALOG.map(model => model.id));
const supportedModels = new Set(ANYMODEL_MODELS);
const MAX_COMPLETION_TOKENS = 1800;

function reportedUsage(value) {
  const inputTokens = value?.prompt_tokens;
  const outputTokens = value?.completion_tokens;
  const totalTokens = value?.total_tokens;
  if (![inputTokens, outputTokens, totalTokens].every(count => Number.isSafeInteger(count) && count >= 0) ||
      totalTokens !== inputTokens + outputTokens) return null;
  // Completion usage already includes reasoning. Adding its detail again would
  // charge the same output tokens twice.
  return { inputTokens, outputTokens, totalTokens };
}

export async function generateAnyModel(request, options) {
  const { model = ANYMODEL_MODEL } = options;
  if (!supportedModels.has(model)) throw new Error('Unsupported model');
  const messages = providerMessages(request, true);
  // UTF-8 bytes provide a conservative text-token bound. Include serialized
  // framing plus extra per-message/protocol headroom and the bounded output.
  const maxTokens = Buffer.byteLength(JSON.stringify(messages), 'utf8') + messages.length * 64 + 256 + MAX_COMPLETION_TOKENS;
  await options.beforeRequest?.({ maxTokens });
  const response = await postProviderJson('https://anymodel.org/v1/chat/completions', {
    model,
    messages,
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    reasoning_effort: 'low',
    stream: false
  }, options);
  const usage = reportedUsage(response?.usage);
  if (usage) await options.onUsage?.(usage);
  return parseCompletion(response);
}
