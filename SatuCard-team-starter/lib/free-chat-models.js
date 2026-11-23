import { postProviderJson, providerMessages } from './provider-http.js';

// Verified 0-cost free models on the upstream gateway (all other free/* slugs currently return HTTP 402).
export const FREE_CHAT_DEFAULT_MODEL = 'free/deepseek-v4.1-flash';
export const FREE_CHAT_CATALOG = Object.freeze([
  { id: 'free/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' },
  { id: 'free/gemini-4-hydrogen', label: 'Gemini 4 Hydrogen' },
  { id: 'free/gpt-6-luna', label: 'GPT-6 Luna (Базовая)' },
  { id: 'free/qwen-3.8-max', label: 'Qwen 3.8 Max' },
  { id: 'free/deepseek-v4-pro-0813', label: 'DeepSeek V4 Pro' },
  { id: 'free/deepseek-v4-flash-0731', label: 'DeepSeek V4 Flash' },
  { id: 'free/glm-5.3-flashx', label: 'GLM-5.3 FlashX' },
  { id: 'free/glm-5.3-flash', label: 'GLM-5.3 Flash' },
  { id: 'free/minimax-m3.1-flash', label: 'MiniMax M3.1 Flash' }
].map(Object.freeze));

export const FREE_CHAT_MODELS = Object.freeze(FREE_CHAT_CATALOG.map(model => model.id));
const supportedFreeModels = new Set(FREE_CHAT_MODELS);
const FREE_CHAT_URL = 'https://api.apinex.bond/v1/chat/completions';
const MAX_OUTPUT_TOKENS = 1400;
const ALLOWED_FINISH = new Set(['stop', 'end_turn', '']);

export function isFreeChatModel(id) {
  return typeof id === 'string' && supportedFreeModels.has(id);
}

export function freeChatModelLabel(id) {
  return FREE_CHAT_CATALOG.find(model => model.id === id)?.label || '';
}

export function configuredFreeChat(env = process.env) {
  if (env.SAI_FREE_MODELS_ENABLED === 'false') return null;
  const key = env.APINEX_API_KEY?.trim();
  if (!key) return null;
  return { key };
}

function stripMarkdownFences(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function extractBalancedJson(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function sanitizePlainReply(text) {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .trim();
}

function normalizeParsedObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Invalid response');
  if (typeof obj.reply !== 'string' || !obj.reply.trim()) throw new Error('Invalid response');
  const reply = sanitizePlainReply(obj.reply);
  let proposal = obj.proposal === undefined ? null : obj.proposal;
  if (proposal !== null && (typeof proposal !== 'object' || Array.isArray(proposal))) {
    proposal = null;
  }
  if (proposal) {
    proposal = {
      title: typeof proposal.title === 'string' ? sanitizePlainReply(proposal.title) : '',
      subtitle: typeof proposal.subtitle === 'string' ? sanitizePlainReply(proposal.subtitle) : '',
      description: typeof proposal.description === 'string' ? sanitizePlainReply(proposal.description) : '',
      features: Array.isArray(proposal.features)
        ? proposal.features.filter(item => typeof item === 'string' && item.trim()).slice(0, 3).map(sanitizePlainReply)
        : [],
      template: typeof proposal.template === 'string' ? proposal.template.trim() : ''
    };
  }
  return { reply, proposal };
}

export function parseFreeChatCompletion(result, { allowPlainReply = false } = {}) {
  if (result?.error || !Array.isArray(result?.choices) || result.choices.length < 1) {
    throw new Error('Invalid response');
  }
  const choice = result.choices[0] ?? {};
  const finish = typeof choice.finish_reason === 'string' ? choice.finish_reason.toLowerCase() : '';
  const message = choice.message;
  if (!ALLOWED_FINISH.has(finish) || message?.role !== 'assistant' || message.refusal ||
      message.tool_calls?.length || message.function_call) {
    throw new Error('Incomplete response');
  }
  const raw = message.content;
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 8000) {
    throw new Error('Incomplete response');
  }
  const cleaned = stripMarkdownFences(raw);
  try {
    return normalizeParsedObject(JSON.parse(cleaned));
  } catch {
    const extracted = extractBalancedJson(cleaned);
    if (extracted) {
      try {
        return normalizeParsedObject(JSON.parse(extracted));
      } catch {
        // Fall through to plain-text check if permitted.
      }
    }
    if (allowPlainReply && !cleaned.includes('{') && cleaned.length <= 1400) {
      return { reply: sanitizePlainReply(cleaned), proposal: null };
    }
    throw new Error('Invalid response');
  }
}

export async function generateFreeChat(request, options) {
  const { model = FREE_CHAT_DEFAULT_MODEL } = options;
  if (!supportedFreeModels.has(model)) throw new Error('Unsupported model');
  const messages = providerMessages(request, true);
  messages[0] = {
    role: 'system',
    content: messages[0].content + '\nOutput strictly one raw JSON object with keys "reply" and "proposal" (null unless the seller asks to edit or build the card). Do not wrap in markdown code fences.'
  };
  const baseBody = {
    model,
    messages,
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0.4,
    stream: false
  };
  let response;
  try {
    response = await postProviderJson(FREE_CHAT_URL, {
      ...baseBody,
      response_format: { type: 'json_object' }
    }, options);
  } catch (error) {
    // Some open models reject response_format with HTTP 400; retry once without it.
    if (error.providerStatus === 400) {
      response = await postProviderJson(FREE_CHAT_URL, baseBody, options);
    } else {
      throw error;
    }
  }
  const allowPlainReply = !request.input?.mode;
  return parseFreeChatCompletion(response, { allowPlainReply });
}
