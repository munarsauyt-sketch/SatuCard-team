export const ACCESS_DAYS = 30;
const maxModels = ['GPT-6 Astra', 'GPT-6.1 Sol', 'Claude Opus 5.5'];
export const BILLING_PLANS = Object.freeze([
  { id: 'basic', name: 'Видео Pro + ИИ Старт', priceKzt: 1500, tokens: 5_000_000,
    models: ['Gemini 2.5 Flash', 'GPT-6 Luna', 'Claude Sonnet 5.5'],
    benefits: ['Видео Full HD 1080p', 'Больше сцен, эффектов и переходов', 'Базовый sAI (RU / KZ)'] },
  { id: 'plus', name: 'ИИ Плюс', priceKzt: 2990, tokens: 8_000_000, includes: 'Видео Pro + ИИ Старт',
    models: ['GPT-6.1 Terra', 'GPT-6 Sol', 'Claude Opus 4.8'],
    benefits: ['Увеличенный лимит токенов sAI'] },
  { id: 'max', name: 'ИИ Макс', priceKzt: 4990, tokens: 10_000_000, includes: 'ИИ Плюс',
    models: maxModels,
    benefits: ['Полный выбор старших моделей sAI'] },
  { id: 'max3', name: 'Команда (5 чел)', priceKzt: 9990, tokens: 30_000_000, includes: 'ИИ Макс',
    models: maxModels,
    benefits: ['До 5 человек в одном пространстве', 'Общие карточки и видео', 'Общий ИИ-чат и лимит ×3'] }
]);

export const ONE_TIME_PACKS = Object.freeze([
  {
    id: 'niche10',
    name: 'Пак «10 нишевых шаблонов»',
    priceKzt: 490,
    permanent: true,
    description: '10 отдельных шаблонов под разные ниши (Электроника, Косметика, Одежда, Авто, Дом, Kaspi Жұма, Спорт, Детские товары, Ювелирка, Продукты). Работают внутри вашего редактора навсегда без выгрузки исходников.'
  }
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
