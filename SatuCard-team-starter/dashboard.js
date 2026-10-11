'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const auth = window.SATUCARD_AUTH;
  const status = document.querySelector('#dashboard-status');
  const grid = document.querySelector('#my-cards');
  const count = document.querySelector('#cards-count');
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
    document.querySelector('#profile-title').textContent = profile.name;
    document.querySelector('#profile-email').textContent = profile.email;
    document.querySelector('#profile-created').textContent = `В SatuCard с ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(new Date(profile.created_at))}`;
    document.querySelector('.profile-avatar').textContent = profile.name[0].toUpperCase();
  } catch (error) {
    status.textContent = error.message || 'Не удалось загрузить профиль.';
    return;
  }

  try {
    const cards = await auth.getMyCards();
    status.textContent = cards.length ? '' : 'Пока нет опубликованных карточек. Создайте первую в редакторе.';
    count.textContent = `${cards.length} из 30 последних`;
    cards.forEach(card => {
      const link = document.createElement('a');
      link.className = 'my-card';
      link.href = `card.html?id=${encodeURIComponent(card.id)}`;
      const image = document.createElement('img');
      image.src = card.imageUrl;
      image.alt = '';
      image.loading = 'lazy';
      const body = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = card.title;
      const price = document.createElement('span');
      price.textContent = `${new Intl.NumberFormat('ru-RU').format(Number(card.price))} ₸`;
      body.append(title, price);
      link.append(image, body);
      grid.append(link);
    });
  } catch (error) {
    status.textContent = error.message || 'Не удалось загрузить карточки.';
  }
});
