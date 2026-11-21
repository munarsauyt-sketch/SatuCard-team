import { ACCESS_DAYS, BILLING_PLANS } from './billing-plans.js';

const money = value => new Intl.NumberFormat('ru-RU').format(value) + ' ₸';
const formatTokens = tokens => Math.round(tokens / 1_000_000) + ' млн токенов';
const purposes = {
  basic: 'Базовые модели sAI для текстов и перевода RU / KZ.',
  plus: 'Больше лимитов и моделей для сложных правок.',
  max: 'Полный выбор старших моделей sAI.',
  max3: 'Тройной лимит sAI для одного аккаунта — 30 млн токенов.',
};

let yearly = false;
function accountUrl(plan) {
  const url = new URL('dashboard.html#billing-title', location.href);
  url.searchParams.set('plan', plan.id + (yearly ? '_yearly' : ''));
  const theme = document.documentElement.dataset.theme;
  if (theme) url.searchParams.set('theme', theme);
  return url.href;
}

for (const plan of BILLING_PLANS) {
  const card = document.createElement('article');
  card.className = 'pricing-card';
  card.dataset.plan = plan.id;

  const head = document.createElement('div');
  head.className = 'pricing-card-head';
  const title = document.createElement('h2');
  title.textContent = plan.name;
  head.append(title);

  if (plan.id === 'max') {
    const rec = document.createElement('span');
    rec.className = 'pricing-card-badge';
    rec.textContent = 'Популярный';
    head.append(rec);
  } else if (plan.tokens) {
    const tok = document.createElement('span');
    tok.className = 'pricing-token-chip';
    tok.textContent = formatTokens(plan.tokens);
    head.append(tok);
  }

  const priceBlock = document.createElement('div');
  priceBlock.className = 'pricing-price-block';
  const price = document.createElement('p');
  price.className = 'pricing-price';
  price.textContent = money(plan.priceKzt);
  const period = document.createElement('p');
  period.className = 'pricing-period';
  period.textContent = 'за ' + ACCESS_DAYS + ' дней';
  priceBlock.append(price, period);

  const meta = document.createElement('div');
  meta.className = 'pricing-meta-strip';
  if (plan.tokens) {
    const tokLine = document.createElement('span');
    tokLine.className = 'pricing-meta-tokens';
    tokLine.textContent = formatTokens(plan.tokens);
    meta.append(tokLine);
  }

  const purpose = document.createElement('p');
  purpose.className = 'pricing-purpose';
  purpose.textContent = purposes[plan.id];

  const models = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Что входит и модели';
  const includes = document.createElement('p');
  includes.className = 'pricing-includes';
  includes.textContent = plan.includes ? 'Включает «' + plan.includes + '» и дополнительно:' : 'Доступно на тарифе:';
  const list = document.createElement('ul');
  for (const benefit of (plan.benefits || [])) {
    const item = document.createElement('li');
    item.dataset.planBenefit = '1';
    item.textContent = benefit;
    list.append(item);
  }
  for (const feature of plan.models) {
    const item = document.createElement('li');
    item.textContent = feature;
    list.append(item);
  }
  models.append(summary, includes, list);

  const link = document.createElement('a');
  link.className = 'pricing-button';
  link.textContent = 'Выбрать тариф';
  link.setAttribute('aria-label', 'Выбрать тариф ' + plan.name);
  link.href = accountUrl(plan);
  link.addEventListener('click', () => { link.href = accountUrl(plan); });

  card.append(head, priceBlock, meta, purpose, models, link);
  document.getElementById('pricing-plans').append(card);
}

document.addEventListener('satucard:billing-cycle', event => {
  yearly = event.detail === 'yearly';
  for (const plan of BILLING_PLANS) {
    const card = document.querySelector('[data-plan="' + plan.id + '"]');
    card.querySelector('.pricing-price').textContent = money(plan.priceKzt * (yearly ? 12 : 1));
    card.querySelector('.pricing-period').textContent = yearly ? 'за год · лимит каждый месяц' : 'за 30 дней';
    card.querySelector('.pricing-button').href = accountUrl(plan);
    card.querySelectorAll('[data-plan-benefit]').forEach((item, index) => {
      const benefit = plan.benefits[index];
      item.textContent = yearly ? benefit.replace('на 30 дней', 'за каждый месяц') : benefit;
    });
  }
});