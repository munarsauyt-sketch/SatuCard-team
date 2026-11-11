import { GET as readCard } from './card.js';
import { contactUrl } from '../lib/publication.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export async function GET(request) {
  const response = await readCard(request);
  const card = await response.json();
  if (!response.ok) {
    return new Response('Карточка недоступна', {
      status: response.status,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  const url = new URL(request.url);
  const detail = new URL('/card.html', url);
  detail.searchParams.set('id', card.id);
  const price = card.showPrice && card.price !== null
    ? new Intl.NumberFormat('ru-RU').format(Number(card.price)) + ' ₸' : '';
  const description = [card.showBrand ? card.brandName : '', price].filter(Boolean).join(' · ');
  let contact = '';
  try {
    const target = contactUrl(card.contactUrl);
    if (target) contact = '<a class="button button-dark" rel="noopener noreferrer" href="' + escape(target) + '">Связаться с продавцом ↗</a>';
  } catch (_) { /* Invalid legacy contact links are omitted. */ }
  const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escape(card.title)} — SatuCard</title>
  <meta property="og:type" content="product">
  <meta property="og:title" content="${escape(card.title)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:image" content="${escape(card.imageUrl)}">
  <meta property="og:url" content="${escape(url.href)}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="/brand.css">
  <link rel="stylesheet" href="/account-pages.css">
</head>
<body>
  <main class="container">
    <a class="brand" href="/">SatuCard.</a>
    <h1>${escape(card.title)}</h1>
    <p>${escape(description)}</p>
    <p>${contact} <a class="button button-light" href="${escape(detail.href)}">Открыть карточку</a></p>
    <img src="${escape(card.imageUrl)}" alt="${escape(card.title)}" width="600" style="max-width:100%;height:auto">
  </main>
</body>
</html>`;
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}
