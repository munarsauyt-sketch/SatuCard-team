export const ACCESS_DAYS = 30;
export const BILLING_PLANS = Object.freeze([
  { id: 'basic', name: 'Basic', priceKzt: 1000, tokens: 5_000_000,
    models: ['Gemini 2.5 Flash', 'GPT-6 Luna', 'Claude Sonnet 5.5'] },
  { id: 'plus', name: 'Plus', priceKzt: 2500, tokens: 8_000_000, includes: 'Basic',
    models: ['GPT-6.1 Terra', 'GPT-6 Sol', 'Claude Opus 4.8'] },
  { id: 'max', name: 'Max', priceKzt: 5000, tokens: 10_000_000, includes: 'Plus',
    models: ['GPT-6 Astra', 'GPT-6.1 Sol', 'Claude Opus 5.5'] },
  { id: 'max3', name: 'Max ×3', priceKzt: 10000, tokens: 30_000_000, includes: 'Max',
    models: ['Тройной объём токенов Max'] }
]);

// Demo receipts exercise checkout screens. They are never payment evidence or
// AI entitlements, and are not stored in the user's account or session.
export function createDemoReceipt(planId, outcome, now = Date.now()) {
  const plan = BILLING_PLANS.find(item => item.id === planId);
  if (!plan || !['success', 'declined', 'cancelled'].includes(outcome) || !Number.isFinite(now)) {
    throw new Error('Invalid demo payment');
  }
  return {
    mode: 'demo', status: outcome, planId: plan.id,
    planPriceKzt: plan.priceKzt, chargedKzt: 0, tokens: plan.tokens,
    createdAt: new Date(now).toISOString(),
    accessExampleUntil: outcome === 'success' ? new Date(now + ACCESS_DAYS * 86400000).toISOString() : null
  };
}
