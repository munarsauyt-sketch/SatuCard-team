import { ANYMODEL_CATALOG } from './anymodel.js';

export function availableAiModels(access) {
  return ANYMODEL_CATALOG.filter(model => access.isAdmin || model.tier <= (access.active?.tier || 0))
    .map(({ id, label }) => ({ id, label }));
}
