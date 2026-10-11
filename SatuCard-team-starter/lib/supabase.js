export function configuration() {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key || !/^https:\/\//.test(base)) return null;
  return { base, key };
}

export async function verifiedUser(request, config) {
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(request.headers.get('authorization') || '');
  if (!match) return null;
  try {
    const response = await fetch(`${config.base}/auth/v1/user`, {
      headers: { apikey: config.key, Authorization: `Bearer ${match[1]}` },
      cache: 'no-store'
    });
    if (!response.ok) return null;
    const user = await response.json();
    return /^[0-9a-f-]{36}$/i.test(user.id || '') ? user : null;
  } catch (_) {
    return null;
  }
}
