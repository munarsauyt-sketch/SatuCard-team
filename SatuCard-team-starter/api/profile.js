import { configuration } from '../lib/supabase.js';
import { accountJson, accountFailure, AccountError, readAccount, normalName, publicProfile } from '../lib/account.js';

export async function GET(request) {
  const config = configuration();
  if (!config) return accountJson({ error: 'Сервер пока не настроен.' }, 503);
  try { return accountJson({ profile: publicProfile((await readAccount(request, config)).profile) }); }
  catch (error) { return accountFailure(error); }
}

export async function POST(request) {
  const config = configuration();
  if (!config) return accountJson({ error: 'Сервер пока не настроен.' }, 503);
  try {
    const { user } = await readAccount(request, config);
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AccountError('Нужны данные JSON.', 415, 'invalid_format');
    const raw = await request.text();
    if (raw.length > 4096) throw new AccountError('Слишком много данных.', 413, 'invalid_profile');
    let body;
    try { body = JSON.parse(raw); } catch { throw new AccountError('Не удалось прочитать данные.', 400, 'invalid_profile'); }
    const firstName = normalName(body?.firstName), lastName = normalName(body?.lastName);
    if (!firstName || !lastName) throw new AccountError('Укажите имя и фамилию: буквы, пробелы, дефис или апостроф, до 39 символов в каждом поле.', 400, 'invalid_profile');
    const response = await fetch(`${config.base}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
      method: 'PATCH', headers: { apikey: config.key, 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, name: `${firstName} ${lastName}`, email: user.email,
        profile_completed_at: new Date().toISOString() })
    });
    if (!response.ok) throw new Error('Profile save failed');
    const profile = (await response.json())[0];
    if (!profile) throw new Error('Profile not saved');
    return accountJson({ profile: publicProfile(profile) });
  } catch (error) { return accountFailure(error); }
}
