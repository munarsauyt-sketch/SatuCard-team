const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !UUID.test(id)) return json({ error: 'Неверная ссылка на карточку.' }, 400);

  const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key || !/^https:\/\//.test(base)) {
    return json({ error: 'Сервер пока не настроен.' }, 503);
  }

  try {
    const query = new URLSearchParams({
      id: `eq.${id}`,
      select: 'id,title,price_kzt,old_price_kzt,style,format,brand_name,image_path,created_at',
      limit: '1'
    });
    const response = await fetch(`${base}/rest/v1/cards?${query}`, {
      headers: { apikey: key, accept: 'application/json' }
    });
    if (!response.ok) {
      console.error('SatuCard database read failed:', response.status);
      return json({ error: 'Не удалось загрузить карточку.' }, 502);
    }
    const [record] = await response.json();
    if (!record) return json({ error: 'Карточка не найдена.' }, 404);

    return json({
      id: record.id,
      title: record.title,
      price: record.price_kzt,
      oldPrice: record.old_price_kzt,
      style: record.style,
      format: record.format,
      brandName: record.brand_name,
      imageUrl: `${base}/storage/v1/object/public/cards/${encodeURIComponent(record.image_path)}`,
      createdAt: record.created_at
    });
  } catch (error) {
    console.error('SatuCard card lookup failed:', error);
    return json({ error: 'Сервер временно недоступен.' }, 502);
  }
}
