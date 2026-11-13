import { configuration } from '../lib/supabase.js';
import { readAccount, accountFailure } from '../lib/account.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

export async function GET(request) {
  const config = configuration();
  if (!config) return json({ error: 'Сервер пока не настроен.' }, 503);
  let user;
  try { ({ user } = await readAccount(request, config, { complete: true })); }
  catch (error) { return accountFailure(error); }
  const rawOffset = Number.parseInt(new URL(request.url, 'http://localhost').searchParams.get('offset') || '0', 10);
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.min(rawOffset, 10000) : 0;
  const query = new URLSearchParams({
    user_id: `eq.${user.id}`,
    select: '*',
    order: 'created_at.desc',
    limit: '30'
  });
  if (offset > 0) query.set('offset', String(offset));
  try {
    const response = await fetch(`${config.base}/rest/v1/cards?${query}`, {
      headers: { apikey: config.key, accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) return json({ error: 'Не удалось загрузить карточки.' }, 502);
    const rows = await response.json();
    const cards = rows.map(row => ({
      id: row.id,
      title: row.title,
      price: row.price_kzt,
      style: row.style,
      format: row.format,
      createdAt: row.created_at,
      imagePath: row.image_path,
      contactUrl: row.contact_url || '',
      showPrice: row.show_price !== false,
      showBrand: row.show_brand !== false,
      imageUrl: `${config.base}/storage/v1/object/public/cards/${encodeURIComponent(row.image_path)}`
    }));
    return json({ cards, nextOffset: cards.length === 30 ? offset + 30 : null });
  } catch (_) {
    return json({ error: 'Сервер временно недоступен.' }, 502);
  }
}
