import { generateGroq } from './groq.js';
import { freeProviderAdapters } from './free-provider-adapters.js';
import { creditProviderAdapters } from './credit-provider-adapters.js';
import { generateAnyModel } from './anymodel.js';

const settings = {
  groq: { label: 'Groq', keyEnv: 'GROQ_API_KEY', adapter: generateGroq },
  mistral: { label: 'Mistral', keyEnv: 'MISTRAL_API_KEY', adapter: freeProviderAdapters.mistral },
  cloudflare: { label: 'Cloudflare Workers AI', keyEnv: 'CLOUDFLARE_API_TOKEN', adapter: freeProviderAdapters.cloudflare },
  cohere: { label: 'Cohere', keyEnv: 'COHERE_API_KEY', adapter: freeProviderAdapters.cohere },
  alibaba: { label: 'Alibaba Cloud', keyEnv: 'ALIBABA_API_KEY', adapter: creditProviderAdapters.alibaba },
  scaleway: { label: 'Scaleway', keyEnv: 'SCALEWAY_API_KEY', adapter: creditProviderAdapters.scaleway },
  anymodel: { label: 'GPT‑6.1 Sol', keyEnv: 'ANYMODEL_API_KEY', adapter: generateAnyModel }
};
const previewFallbacks = ['mistral', 'cloudflare', 'cohere'];
const previewEvaluations = ['alibaba', 'scaleway'];
const listed = (value, id) => (value || '').split(',').some(part => part.trim() === id);

export function textProviderAdapter(id) {
  return Object.hasOwn(settings, id) ? settings[id].adapter : undefined;
}

export function getTextProvider(id, env = process.env) {
  if (!Object.hasOwn(settings, id)) return null;
  const { label, keyEnv } = settings[id];
  const key = env[keyEnv]?.trim();
  if (!key) return null;
  if (id === 'cloudflare') {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
    if (!/^[a-f0-9]{32}$/i.test(accountId || '')) return null;
    return { key, accountId, label };
  }
  return { key, label };
}

export function isFallbackProvider(id) {
  return id === 'groq' || previewFallbacks.includes(id);
}

export function configuredFallback(id, env = process.env) {
  const enabled = id === 'groq' ? env.GROQ_CHAT_FALLBACK_ENABLED === 'true'
    : env.VERCEL_ENV === 'preview' && previewFallbacks.includes(id) && listed(env.SAI_PREVIEW_FALLBACKS, id);
  return enabled ? getTextProvider(id, env) : null;
}

export function configuredEvaluation(id, env = process.env) {
  if (env.VERCEL_ENV !== 'preview' || !previewEvaluations.includes(id) || !listed(env.SAI_PREVIEW_EVALUATION, id)) return null;
  return getTextProvider(id, env);
}

export function configuredSol(env = process.env) {
  const enabled = (env.VERCEL_ENV === 'preview' && env.SAI_PREVIEW_ANYMODEL_ENABLED === 'true') ||
    (env.VERCEL_ENV === 'production' && env.SAI_PRODUCTION_ANYMODEL_ENABLED === 'true');
  return enabled ? getTextProvider('anymodel', env) : null;
}

function available(ids, lookup) {
  return ids.flatMap(id => {
    const config = lookup(id);
    return config ? [{ id, label: config.label }] : [];
  });
}

export const availableFallbacks = () => available(['groq', ...previewFallbacks], configuredFallback);
export const availableEvaluations = () => available(previewEvaluations, configuredEvaluation);
