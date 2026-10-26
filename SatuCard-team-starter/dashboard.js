'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const auth = window.SATUCARD_AUTH;
  const status = document.querySelector('#dashboard-status');
  const grid = document.querySelector('#my-cards');
  const count = document.querySelector('#cards-count');
  const page = document.querySelector('.dashboard-main');
  const loading = document.querySelector('#cards-loading');
  const empty = document.querySelector('#dashboard-empty');
  grid.setAttribute('aria-busy', 'true');
  const logout = document.querySelector('#logout-button');
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    await auth.signOut();
    location.replace('auth.html');
  });

  const session = await auth.getSession();
  if (!session) { location.replace('auth.html'); return; }
  try {
    const profile = await auth.getProfile();
    if (!profile) throw new Error('Профиль не найден. Попробуйте войти снова.');
    if (!profile.profile_completed_at) { location.replace('profile.html?registration=1'); return; }
    document.querySelector('#profile-title').textContent = profile.name;
    document.querySelector('#profile-email').textContent = profile.email;
    document.querySelector('#profile-created').textContent = `В SatuCard с ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(new Date(profile.created_at))}`;
    document.querySelector('.profile-avatar').textContent = profile.name[0].toUpperCase();
  } catch (error) {
    if (['sign_in_required', 'mail_proof_required', 'email_unconfirmed'].includes(error.code)) { location.replace('auth.html?verify=1'); return; }
    status.textContent = error.message || 'Не удалось загрузить профиль.';
    document.querySelector('#profile-title').textContent = 'Профиль недоступен';
    loading.hidden = true;
    page.dataset.state = 'error';
    grid.setAttribute('aria-busy', 'false');
    return;
  }

  try {
    const cards = await auth.getMyCards();
    status.textContent = cards.length ? '' : 'В коллекции пока нет опубликованных карточек.';
    count.textContent = `${cards.length} из 30 последних`;
    empty.hidden = cards.length > 0;
    page.dataset.state = cards.length ? 'ready' : 'empty';
    cards.forEach(card => {
      const link = document.createElement('a');
      link.className = 'my-card';
      link.href = `card.html?id=${encodeURIComponent(card.id)}`;
      link.setAttribute('aria-label', `Открыть карточку «${card.title}»`);
      const media = document.createElement('div');
      media.className = 'my-card-image-stage';
      const image = document.createElement('img');
      image.src = card.imageUrl;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      const format = document.createElement('span');
      format.className = 'my-card-format';
      format.textContent = { portrait: 'ПОСТ / 4:5', square: 'КАТАЛОГ / 1:1', story: 'ИСТОРИЯ / 9:16' }[card.format] || 'КАРТОЧКА';
      media.append(image, format);
      const body = document.createElement('div');
      body.className = 'my-card-body';
      const title = document.createElement('strong');
      title.textContent = card.title;
      const price = document.createElement('span');
      price.className = 'my-card-price';
      price.textContent = `${new Intl.NumberFormat('ru-RU').format(Number(card.price))} ₸`;
      const arrow = document.createElement('span');
      arrow.className = 'my-card-arrow';
      arrow.textContent = '↗';
      arrow.setAttribute('aria-hidden', 'true');
      const date = document.createElement('span');
      date.className = 'my-card-date';
      date.textContent = `Опубликовано ${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(card.createdAt))}`;
      body.append(title, price, arrow, date);
      link.append(media, body);
      grid.append(link);
    });
  } catch (error) {
    status.textContent = error.message || 'Не удалось загрузить карточки.';
    page.dataset.state = 'error';
  } finally {
    loading.hidden = true;
    grid.setAttribute('aria-busy', 'false');
  }
});
