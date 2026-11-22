import { ANYMODEL_CATALOG } from './anymodel.js';

const defaultsByTier = Object.freeze({
  1: 'cx/gpt-6-luna',
  2: 'cx/gpt-6.1-terra',
  3: 'cx/gpt-6.1-sol'
});

export function availableAiModels(access) {
  return ANYMODEL_CATALOG.filter(model => access.isAdmin || model.tier <= (access.active?.tier || 0))
    .map(({ id, label }) => ({ id, label }));
}

export function defaultAiModel(access) {
  const tier = access.isAdmin ? 3 : access.active?.tier;
  return availableAiModels(access).find(model => model.id === defaultsByTier[tier]) || null;
}
