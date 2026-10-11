import { randomUUID } from 'node:crypto';
import { configuration, verifiedUser } from '../lib/supabase.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const STYLES = new Set(['studio', 'accent', 'minimal']);
const FORMATS = new Set(['portrait', 'square']);

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

function priceInCents(raw, optional = false) {
  if (optional && raw === '') return null;
  if (!/^(?:0|[1-9]\d{0,8})(?:[.,]\d{1,2})?$/.test(raw)) return NaN;
  const [whole, fraction = ''] = raw.replace(',', '.').split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export async function POST(request) {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    return json({ error: 'Нужны данные формы с изображением.' }, 415);
  }

  const config = configuration();
  if (!config) return json({ error: 'Публикация пока не настроена.' }, 503);
  const user = await verifiedUser(request, config);
  if (!user) return json({ error: 'Войдите в аккаунт, чтобы опубликовать карточку.' }, 401);

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Не удалось прочитать данные карточки.' }, 400);
  }

  const title = String(form.get('title') ?? '').trim();
  const brandName = String(form.get('brandName') ?? '').trim();
  const price = priceInCents(String(form.get('price') ?? '').trim());
  const oldPrice = priceInCents(String(form.get('oldPrice') ?? '').trim(), true);
  const style = String(form.get('style') ?? '');
  const format = String(form.get('format') ?? '');
  const image = form.get('image');

  if (!title || [...title].length > 60 || [...brandName].length > 28 ||
      !Number.isSafeInteger(price) || price < 0 || price > 99999999999 ||
      (oldPrice !== null && (!Number.isSafeInteger(oldPrice) || oldPrice <= price || oldPrice > 99999999999)) ||
      !STYLES.has(style) || !FORMATS.has(format)) {
    return json({ error: 'Проверьте название, цену и оформление карточки.' }, 400);
  }

  if (!image || image.type !== 'image/jpeg' || !image.size || image.size > MAX_IMAGE_BYTES ||
      typeof image.arrayBuffer !== 'function') {
    return json({ error: 'Готовое изображение должно быть JPEG до 2 МБ.' }, 400);
  }

  let bytes;
  try {
    bytes = new Uint8Array(await image.arrayBuffer());
  } catch {
    return json({ error: 'Не удалось прочитать готовое изображение.' }, 400);
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    return json({ error: 'Готовое изображение должно быть JPEG до 2 МБ.' }, 400);
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return json({ error: 'Файл не похож на JPEG.' }, 400);
  }

  const id = randomUUID();
  const imagePath = `${id}.jpg`;
  const storageUrl = `${config.base}/storage/v1/object/cards/${imagePath}`;
  const headers = { apikey: config.key };

  try {
    const upload = await fetch(storageUrl, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'image/jpeg', 'cache-control': '3600', 'x-upsert': 'false' },
      body: bytes
    });
    if (!upload.ok) {
      console.error('SatuCard Storage upload failed:', upload.status);
      return json({ error: 'Не удалось сохранить изображение. Попробуйте позже.' }, 502);
    }

    const record = {
      id,
      user_id: user.id,
      title,
      price_kzt: (price / 100).toFixed(2),
      old_price_kzt: oldPrice === null ? null : (oldPrice / 100).toFixed(2),
      style,
      format,
      brand_name: brandName,
      image_path: imagePath
    };
    const save = await fetch(`${config.base}/rest/v1/cards`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify(record)
    });
    if (!save.ok) {
      console.error('SatuCard database insert failed:', save.status);
      await fetch(storageUrl, { method: 'DELETE', headers }).catch(() => {});
      return json({ error: 'Не удалось сохранить карточку. Попробуйте позже.' }, 502);
    }

    return json({ id, url: new URL(`/card.html?id=${id}`, request.url).href }, 201);
  } catch (error) {
    console.error('SatuCard publication failed:', error);
    return json({ error: 'Сервер временно недоступен. Попробуйте позже.' }, 502);
  }
}
