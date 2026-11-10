import { ACCESS_DAYS, BILLING_PLANS, createDemoReceipt } from './billing-plans.js';

const money = value => new Intl.NumberFormat('ru-RU').format(value) + ' ₸';
const tokens = value => new Intl.NumberFormat('ru-RU').format(value);
const dialog = document.getElementById('demo-checkout');
const actions = document.getElementById('checkout-actions');
const result = document.getElementById('demo-result');
let selectedPlan;

function checkout(plan) {
  selectedPlan = plan;
  document.getElementById('checkout-plan').textContent = plan.name;
  document.getElementById('checkout-price').textContent = money(plan.priceKzt);
  document.getElementById('checkout-tokens').textContent = tokens(plan.tokens);
  actions.hidden = false; result.hidden = true; result.textContent = '';
  dialog.showModal();
}

for (const plan of BILLING_PLANS) {
  const card = document.createElement('article');
  card.className = 'pricing-card'; card.dataset.plan = plan.id;
  const title = document.createElement('h2'); title.textContent = plan.name;
  const price = document.createElement('p'); price.className = 'pricing-price'; price.textContent = money(plan.priceKzt);
  const period = document.createElement('p'); period.className = 'pricing-period'; period.textContent = 'за ' + ACCESS_DAYS + ' дней';
  const count = document.createElement('p'); count.className = 'pricing-token-count'; count.textContent = tokens(plan.tokens) + ' токенов';
  const includes = document.createElement('p'); includes.className = 'pricing-includes';
  includes.textContent = plan.includes ? 'Все модели ' + plan.includes + ' и дополнительно' : 'Для повседневных задач';
  if (plan.id === 'max3') includes.textContent = 'Те же модели Max';
  const list = document.createElement('ul');
  for (const model of plan.models) { const item = document.createElement('li'); item.textContent = model; list.append(item); }
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'pricing-button'; button.textContent = 'Проверить оплату';
  button.setAttribute('aria-label', 'Проверить оплату тарифа ' + plan.name);
  button.addEventListener('click', () => checkout(plan));
  card.append(title, price, period, count, includes, list, button);
  document.getElementById('pricing-plans').append(card);
}

for (const button of actions.querySelectorAll('[data-payment-result]')) {
  button.addEventListener('click', () => {
    if (!selectedPlan) return;
    const receipt = createDemoReceipt(selectedPlan.id, button.dataset.paymentResult);
    const heading = {
      success: 'Демонстрационная оплата прошла',
      declined: 'Банк отклонил демонстрационный платёж',
      cancelled: 'Демонстрационная покупка отменена'
    }[receipt.status];
    let detail = 'Списание — 0 ₸.';
    if (receipt.accessExampleUntil) {
      const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(receipt.accessExampleUntil));
      detail += '\nПример срока доступа — до ' + date + '.';
    } else detail += '\nМожно вернуться к тарифам и повторить проверку.';
    result.textContent = heading + '\n' + detail;
    result.hidden = false; actions.hidden = true;
  });
}
