'use strict';

(() => {
  const id = new URLSearchParams(location.search).get('id');
  const title = document.querySelector('#card-title');
  const status = document.querySelector('#card-status');
  const content = document.querySelector('#shared-card-content');
  const formatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

  if (!id) {
    title.textContent = 'Ссылка на карточку неполная';
    status.textContent = 'Откройте ссылку, которую вы получили после публикации.';
    return;
  }

  fetch(`api/card?id=${encodeURIComponent(id)}`)
    .then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось открыть карточку.');
      return data;
    })
    .then(card => {
      title.textContent = card.title;
      document.title = `${card.title} — SatuCard`;
      document.querySelector('#card-image').src = card.imageUrl;
      document.querySelector('#card-image').alt = `Карточка товара «${card.title}»`;
      document.querySelector('#card-image-link').href = card.imageUrl;
      document.querySelector('#card-price').textContent = `${formatter.format(Number(card.price))} ₸`;
      document.querySelector('#card-old-price').textContent = card.oldPrice === null
        ? ''
        : `${formatter.format(Number(card.oldPrice))} ₸`;
      document.querySelector('#card-brand').textContent = card.brandName || 'Карточка создана в SatuCard';
      status.textContent = '';
      content.hidden = false;
    })
    .catch(error => {
      title.textContent = 'Карточка недоступна';
      status.textContent = error.message || 'Попробуйте открыть ссылку позже.';
    });
})();
