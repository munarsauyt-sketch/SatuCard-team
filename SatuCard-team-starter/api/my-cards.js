import { configuration, verifiedUser } from '../lib/supabase.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export async function GET(request) {
  const config = configuration();
  if (!config) return json({ error: 'Сервер пока не настроен.' }, 503);
  const user = await verifiedUser(request, config);
  if (!user) return json({ error: 'Войдите в аккаунт.' }, 401);
  const query = new URLSearchParams({
    user_id: `eq.${user.id}`,
    select: 'id,title,price_kzt,style,format,created_at,image_path',
    order: 'created_at.desc',
    limit: '30'
  });
  try {
    const response = await fetch(`${config.base}/rest/v1/cards?${query}`, {
      headers: { apikey: config.key, accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) return json({ error: 'Не удалось загрузить карточки.' }, 502);
    const rows = await response.json();
    return json({ cards: rows.map(row => ({
      id: row.id,
      title: row.title,
      price: row.price_kzt,
      style: row.style,
      format: row.format,
      createdAt: row.created_at,
      imageUrl: `${config.base}/storage/v1/object/public/cards/${encodeURIComponent(row.image_path)}`
    })) });
  } catch (_) {
    return json({ error: 'Сервер временно недоступен.' }, 502);
  }
}
