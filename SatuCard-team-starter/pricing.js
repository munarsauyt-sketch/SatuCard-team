import { ACCESS_DAYS, BILLING_PLANS, ONE_TIME_PACKS } from './billing-plans.js';

const money = value => new Intl.NumberFormat('ru-RU').format(value) + ' ₸';
const purposes = {
  basic: 'Видео Full HD 1080p, больше сцен и эффектов + базовый sAI.',
  plus: 'Всё из Видео Pro + больше лимитов и моделей для сложных правок.',
  max: 'Полный выбор старших моделей sAI + Видео Pro.',
  max3: 'До 5 человек в одном пространстве: общие карточки, видео и ИИ-чат sAI.',
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
  const summary = document.createElement('summary'); summary.textContent = 'Что входит и модели';
  const includes = document.createElement('p');
  includes.textContent = plan.includes ? 'Включает «' + plan.includes + '» и дополнительно:' : 'Доступно на тарифе:';
  const list = document.createElement('ul');
  for (const benefit of (plan.benefits || [])) {
    const item = document.createElement('li');
    item.dataset.planBenefit = '1';
    item.textContent = benefit;
    list.append(item);
  }
  for (const feature of plan.models) {
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

const packsBox = document.getElementById('pricing-packs');
if (packsBox && typeof ONE_TIME_PACKS !== 'undefined') {
  for (const pack of ONE_TIME_PACKS) {
    const card = document.createElement('article');
    card.className = 'pricing-pack-card';
    card.dataset.pack = pack.id;
    const info = document.createElement('div');
    const badge = document.createElement('span');
    badge.className = 'pricing-pack-badge';
    badge.textContent = 'РАЗОВАЯ ПОКУПКА · НАВСЕГДА';
    const title = document.createElement('h2');
    title.textContent = pack.name;
    const desc = document.createElement('p');
    desc.textContent = pack.description;
    info.append(badge, title, desc);

    const action = document.createElement('div');
    action.className = 'pricing-pack-action';
    const price = document.createElement('p');
    price.className = 'pricing-price';
    price.textContent = money(pack.priceKzt);
    const link = document.createElement('a');
    link.className = 'pricing-button';
    link.textContent = 'Открыть набор в кабинете';
    link.href = accountUrl(pack);
    link.addEventListener('click', () => { link.href = accountUrl(pack); });
    action.append(price, link);

    card.append(info, action);
    packsBox.append(card);
  }
}
