import { ACCESS_DAYS, BILLING_PLANS } from './billing-plans.js';

const money = value => new Intl.NumberFormat('ru-RU').format(value) + ' ₸';
const purposes = {
  basic: 'Тексты и правки карточек с sAI.',
  plus: 'Дополнительные модели для сложных правок и сравнений.',
  max: 'Полный выбор моделей sAI.',
  max3: 'Модели Max с тройным объёмом лимитов.',
};
function accountUrl(plan) {
  const url = new URL('dashboard.html#billing-title', location.href);
  url.searchParams.set('plan', plan.id);
  const theme = document.documentElement.dataset.theme;
  if (theme) url.searchParams.set('theme', theme);
  return url.href;
}
for (const plan of BILLING_PLANS) {
  const card = document.createElement('article');
  card.className = 'pricing-card'; card.dataset.plan = plan.id;
  const title = document.createElement('h2'); title.textContent = plan.name;
  const price = document.createElement('p'); price.className = 'pricing-price'; price.textContent = money(plan.priceKzt);
  const period = document.createElement('p'); period.className = 'pricing-period'; period.textContent = 'за ' + ACCESS_DAYS + ' дней';
  const purpose = document.createElement('p'); purpose.className = 'pricing-purpose'; purpose.textContent = purposes[plan.id];
  const models = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = 'Доступные модели';
  const includes = document.createElement('p');
  includes.textContent = plan.includes ? 'Модели ' + plan.includes + ' и дополнительно' : 'Модели тарифа';
  const list = document.createElement('ul');
  for (const feature of [...plan.models, ...(plan.benefits || [])]) {
    const item = document.createElement('li'); item.textContent = feature; list.append(item);
  }
  models.append(summary, includes, list);
  const link = document.createElement('a');
  link.className = 'pricing-button'; link.textContent = 'Выбрать тариф';
  link.setAttribute('aria-label', 'Выбрать тариф ' + plan.name);
  link.href = accountUrl(plan);
  link.addEventListener('click', () => { link.href = accountUrl(plan); });
  card.append(title, price, period, purpose, models, link);
  document.getElementById('pricing-plans').append(card);
}
