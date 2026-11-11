import { ACCESS_DAYS, BILLING_PLANS } from './billing-plans.js';
import { TRANSFER_CARD, TRANSFER_CARD_DISPLAY } from './payment-requisites.js';
import { SUPPORT } from './support.js';

const money = value => new Intl.NumberFormat('ru-RU').format(value) + ' ₸';
const dialog = document.getElementById('transfer-checkout');
const copyStatus = document.getElementById('copy-transfer-status');
document.getElementById('transfer-card').value = TRANSFER_CARD_DISPLAY;
document.getElementById('transfer-support').href = 'mailto:' + SUPPORT.emails[0];

function checkout(plan) {
  document.getElementById('checkout-plan').textContent = plan.name;
  document.getElementById('checkout-price').textContent = money(plan.priceKzt);
  const account = new URL('dashboard.html#billing-title', location.href);
  account.searchParams.set('plan', plan.id);
  const theme = document.documentElement.dataset.theme;
  if (theme) account.searchParams.set('theme', theme);
  document.getElementById('checkout-account').href = account.href;
  copyStatus.textContent = '';
  dialog.showModal();
}

for (const plan of BILLING_PLANS) {
  const card = document.createElement('article');
  card.className = 'pricing-card'; card.dataset.plan = plan.id;
  const title = document.createElement('h2'); title.textContent = plan.name;
  const price = document.createElement('p'); price.className = 'pricing-price'; price.textContent = money(plan.priceKzt);
  const period = document.createElement('p'); period.className = 'pricing-period'; period.textContent = 'за ' + ACCESS_DAYS + ' дней';
  const includes = document.createElement('p'); includes.className = 'pricing-includes';
  includes.textContent = plan.includes ? 'Модели ' + plan.includes + ' и дополнительно' : 'Модели тарифа';
  if (plan.id === 'max3') includes.textContent = 'Модели Max';
  const list = document.createElement('ul');
  list.setAttribute('role', 'list');
  for (const feature of [...plan.models, ...(plan.benefits || [])]) {
    const item = document.createElement('li');
    item.textContent = feature;
    if (plan.benefits?.includes(feature)) item.dataset.planBenefit = '';
    list.append(item);
  }
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'pricing-button'; button.textContent = 'Реквизиты для перевода';
  button.setAttribute('aria-label', 'Реквизиты для оплаты тарифа ' + plan.name);
  button.addEventListener('click', () => checkout(plan));
  card.append(title, price, period, includes, list, button);
  document.getElementById('pricing-plans').append(card);
}

document.getElementById('copy-transfer-card').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(TRANSFER_CARD);
    copyStatus.textContent = 'Номер карты скопирован.';
  } catch {
    copyStatus.textContent = 'Не удалось скопировать. Выделите номер карты и скопируйте его вручную.';
  }
});
