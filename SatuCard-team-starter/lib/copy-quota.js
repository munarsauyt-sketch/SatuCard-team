// Authoritative quota lives in PostgreSQL, shared by cold starts and deployments
// pointing at the same database. A reservation is consumed even on provider failure.
// There is intentionally no retry and no refund after an uncertain outcome.
export async function reserveCopyQuota(config, userId, { fetcher = fetch, timeoutMs = 5000 } = {}) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Quota timeout')); }, timeoutMs); });
  try {
    return await Promise.race([timeout, (async () => {
      // New Supabase sb_secret_ keys are opaque, not JWTs. Only legacy keys
      // belong in Authorization; never forward the user's session here.
      const headers = { apikey: config.key, 'content-type': 'application/json' };
      if (!config.key.startsWith('sb_')) headers.Authorization = `Bearer ${config.key}`;
      const response = await fetcher(`${config.base}/rest/v1/rpc/reserve_ai_copy_attempt`, {
        method: 'POST', signal: controller.signal, cache: 'no-store',
        headers,
        body: JSON.stringify({ p_user_id: userId })
      });
      if (!response.ok) throw new Error('Quota unavailable');
      const result = await response.json();
      if (!result || typeof result !== 'object' || typeof result.allowed !== 'boolean') throw new Error('Invalid quota response');
      return result.allowed;
    })()]);
  } finally { clearTimeout(timer); }
}
