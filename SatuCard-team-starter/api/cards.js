import { randomUUID } from 'node:crypto';
import { configuration } from '../lib/supabase.js';
import { readAccount, AccountError, accountFailure } from '../lib/account.js';
import { ownedCard, contactUrl } from '../lib/publication.js';
import { readBoundedBody } from '../lib/request-body.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const STYLES = new Set(['studio', 'accent', 'minimal', 'noir', 'neon', 'editorial', 'bloom', 'bold']);
// Public cards are already-rendered images. Keep their category readable by the shared database.
const styleAliases = { showcase: 'accent', blueprint: 'neon', matcha: 'studio', pop: 'bold', graphite: 'editorial', cloud: 'bloom' };
const FORMATS = new Set(['portrait', 'portrait34', 'square', 'story']);

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
  let user;
  try { ({ user } = await readAccount(request, config, { complete: true })); }
  catch (error) { return accountFailure(error); }

  let form;
  try {
    const bytes = await readBoundedBody(request, MAX_IMAGE_BYTES + 64 * 1024);
    form = await new Response(bytes, { headers: { 'content-type': request.headers.get('content-type') } }).formData();
  } catch (error) {
    if (error.status === 413) return accountFailure(error);
    return json({ error: 'Не удалось прочитать данные карточки.' }, 400);
  }

  const title = String(form.get('title') ?? '').trim();
  const showPrice = form.get('showPrice') !== 'false';
  const showBrand = form.get('showBrand') !== 'false';
  let contact, previous;
  try {
    contact = contactUrl(String(form.get('contactUrl') || ''));
    if (form.has('id')) {
      previous = await ownedCard(config, user.id, String(form.get('id')));
      if (form.get('expectedImagePath') !== previous.image_path) throw new AccountError('Карточка изменена. Обновите кабинет перед повтором.', 409, 'version_conflict');
    }
  } catch (error) { return accountFailure(error); }
  const brandName = String(form.get('brandName') ?? '').trim();
  const price = priceInCents(String(form.get('price') ?? '').trim(), !showPrice);
  const oldPrice = priceInCents(String(form.get('oldPrice') ?? '').trim(), true);
  const requestedStyle = String(form.get('style') ?? '');
  const style = Object.hasOwn(styleAliases, requestedStyle) ? styleAliases[requestedStyle] : requestedStyle;
  const format = String(form.get('format') ?? '');
  const image = form.get('image');

  if (!title || [...title].length > 60 || [...brandName].length > 28 ||
      (showPrice && !Number.isSafeInteger(price)) || (price !== null && (!Number.isSafeInteger(price) || price < 0 || price > 99999999999)) ||
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

  const id = previous?.id || randomUUID();
  const imagePath = previous ? `${id}-${randomUUID()}.jpg` : `${id}.jpg`;
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
      price_kzt: price === null ? null : (price / 100).toFixed(2),
      old_price_kzt: oldPrice === null ? null : (oldPrice / 100).toFixed(2),
      style,
      format,
      brand_name: showBrand ? brandName : '',
      image_path: imagePath
    };
    if (!showPrice || !showBrand || contact || previous?.show_price !== undefined) {
      Object.assign(record, { show_price: showPrice, show_brand: showBrand, contact_url: contact });
    }
    const query = previous ? '?' + new URLSearchParams({ id: 'eq.' + id, user_id: 'eq.' + user.id, image_path: 'eq.' + previous.image_path, select: 'id' }) : '';
    const save = await fetch(`${config.base}/rest/v1/cards` + query, {
      method: previous ? 'PATCH' : 'POST',
      headers: { ...headers, 'content-type': 'application/json', prefer: previous ? 'return=representation' : 'return=minimal' },
      body: JSON.stringify(record)
    });
    if (!save.ok) {
      console.error('SatuCard database insert failed:', save.status);
      await fetch(storageUrl, { method: 'DELETE', headers }).catch(() => {});
      return json({ error: 'Не удалось сохранить карточку. Попробуйте позже.' }, 502);
    }
    if (previous && !(await save.json()).length) {
      await fetch(storageUrl, { method: 'DELETE', headers }).catch(() => {});
      return json({ error: 'Карточка уже изменена. Обновите кабинет.', code: 'version_conflict' }, 409);
    }
    if (previous) await fetch(config.base + '/storage/v1/object/cards/' + encodeURIComponent(previous.image_path), { method: 'DELETE', headers }).catch(() => {});

    return json({ id, imagePath, url: new URL(`/card.html?id=${id}`, request.url).href }, previous ? 200 : 201);
  } catch (error) {
    console.error('SatuCard publication failed:', error);
    return json({ error: 'Сервер временно недоступен. Попробуйте позже.' }, 502);
  }
}

export async function DELETE(request) {
  const config = configuration();
  if (!config) return json({ error: 'Публикация пока не настроена.' }, 503);
  try {
    const { user } = await readAccount(request, config, { complete: true });
    const params = new URL(request.url).searchParams;
    const row = await ownedCard(config, user.id, params.get('id'));
    if (params.get('imagePath') !== row.image_path) throw new AccountError('Карточка изменена. Обновите кабинет.', 409, 'version_conflict');
    const query = new URLSearchParams({ id: 'eq.' + row.id, user_id: 'eq.' + user.id, image_path: 'eq.' + row.image_path, select: 'id' });
    const response = await fetch(config.base + '/rest/v1/cards?' + query, { method: 'DELETE', headers: { apikey: config.key, prefer: 'return=representation' } });
    if (!response.ok) throw new Error('Delete failed');
    if (!(await response.json()).length) throw new AccountError('Карточка изменена. Обновите кабинет.', 409, 'version_conflict');
    await fetch(config.base + '/storage/v1/object/cards/' + encodeURIComponent(row.image_path), { method: 'DELETE', headers: { apikey: config.key } }).catch(() => {});
    return json({ deleted: true });
  } catch (error) { return accountFailure(error); }
}

export async function GET(request) {
  const config = configuration();
  if (!config) return json({ error: 'Публикация пока не настроена.' }, 503);
  try {
    const { user } = await readAccount(request, config, { complete: true });
    const row = await ownedCard(config, user.id, new URL(request.url).searchParams.get('id'));
    return json({ card: { id: row.id, title: row.title, price: row.price_kzt, imagePath: row.image_path, contactUrl: row.contact_url || '', showPrice: row.show_price !== false, showBrand: row.show_brand !== false } });
  } catch (error) { return accountFailure(error); }
}
