export const ACCESS_DAYS = 30;
const maxModels = ['GPT-6 Astra', 'GPT-6.1 Sol', 'Claude Opus 5.5'];
export const BILLING_PLANS = Object.freeze([
  { id: 'basic', name: 'ИИ Старт', priceKzt: 1500, tokens: 5_000_000,
    models: ['Gemini 2.5 Flash', 'GPT-6 Luna', 'Claude Sonnet 5.5'],
    benefits: ['Базовый sAI (RU / KZ)', '5 млн токенов на 30 дней'] },
  { id: 'plus', name: 'ИИ Плюс', priceKzt: 2990, tokens: 8_000_000, includes: 'ИИ Старт',
    models: ['GPT-6.1 Terra', 'GPT-6 Sol', 'Claude Opus 4.8'],
    benefits: ['Увеличенный лимит токенов sAI'] },
  { id: 'max', name: 'ИИ Макс', priceKzt: 4990, tokens: 10_000_000, includes: 'ИИ Плюс',
    models: maxModels,
    benefits: ['Полный выбор старших моделей sAI'] },
  { id: 'max3', name: 'ИИ Макс ×3', priceKzt: 9990, tokens: 30_000_000, includes: 'ИИ Макс',
    models: maxModels,
    benefits: ['Личный лимит sAI ×3 — 30 млн токенов', 'Один аккаунт, полный выбор старших моделей'] }
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


// Annual orders prepay twelve monthly allowances; unused quota does not carry over.
export const YEARLY_BILLING_PLANS = Object.freeze(BILLING_PLANS.map(plan => Object.freeze({
  ...plan, id: plan.id + '_yearly', basePlanId: plan.id,
  name: plan.name + ' · год', priceKzt: plan.priceKzt * 12, months: 12,
  benefits: plan.benefits.map(text => text.replace('на 30 дней', 'за каждый месяц'))
})));
