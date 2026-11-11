import { AccountError } from './account.js';

export const cardId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function contactUrl(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > 2000) throw new AccountError('Проверьте ссылку магазина.', 400, 'invalid_contact');
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    return url.href;
  } catch (_) { throw new AccountError('Укажите HTTPS-ссылку на магазин, товар или WhatsApp.', 400, 'invalid_contact'); }
}

export async function ownedCard(config, userId, id) {
  if (!cardId(id)) throw new AccountError('Неверный номер карточки.', 400, 'invalid_card_id');
  const query = new URLSearchParams({ id: 'eq.' + id, user_id: 'eq.' + userId, select: '*', limit: '1' });
  const response = await fetch(config.base + '/rest/v1/cards?' + query, { headers: { apikey: config.key }, cache: 'no-store' });
  if (!response.ok) throw new Error('Card service unavailable');
  const row = (await response.json())[0];
  if (!row) throw new AccountError('Карточка не найдена.', 404, 'card_not_found');
  return row;
}
