import { verifiedUser } from './supabase.js';

export class AccountError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

export function normalName(value) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  return [...name].length >= 1 && [...name].length <= 39 && /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(name) ? name : null;
}

// Decode claims only AFTER Supabase has authenticated this exact bearer token.
// User-editable metadata and the presence of a linked Google identity are not proof.
export function hasMailboxProof(request, userId) {
  try {
    const token = request.headers.get('authorization').slice(7);
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return claims.sub === userId && Array.isArray(claims.amr) && claims.amr.some(item =>
      ['oauth', 'otp', 'magiclink', 'recovery'].includes(item?.method));
  } catch { return false; }
}

export function accountJson(data, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

export function accountFailure(error) {
  return accountJson({ error: error instanceof AccountError ? error.message : 'Не удалось связаться с сервером. Попробуйте позже.',
    code: error instanceof AccountError ? error.code : 'service_unavailable' }, error instanceof AccountError ? error.status : 502);
}

export async function readAccount(request, config, { complete = false } = {}) {
  const user = await verifiedUser(request, config);
  if (!user) throw new AccountError('Войдите в аккаунт.', 401, 'sign_in_required');
  if (!user.email_confirmed_at) throw new AccountError('Подтвердите email по письму или войдите через Google.', 403, 'email_unconfirmed');
  const query = new URLSearchParams({ id: `eq.${user.id}`, select: 'id,name,email,first_name,last_name,profile_completed_at,mail_proof_required,created_at', limit: '1' });
  const response = await fetch(`${config.base}/rest/v1/profiles?${query}`, { headers: { apikey: config.key }, cache: 'no-store' });
  if (!response.ok) throw new Error('Profile lookup failed');
  const profile = (await response.json())[0];
  if (!profile) throw new AccountError('Профиль пока не найден. Повторите вход.', 409, 'profile_missing');
  // Earlier classroom registrations were auto-confirmed. Their old password alone
  // must never prove ownership of the mailbox, even after its owner uses Google.
  if (profile.mail_proof_required && !hasMailboxProof(request, user.id)) {
    throw new AccountError('Этот аккаунт создан до включения проверки почты. Войдите через Google или подтвердите код из письма.', 403, 'mail_proof_required');
  }
  if (complete && !profile.profile_completed_at) throw new AccountError('Завершите регистрацию: укажите имя и фамилию.', 403, 'profile_incomplete');
  return { user, profile };
}

export function publicProfile(profile) {
  const { mail_proof_required, ...result } = profile;
  return result;
}
