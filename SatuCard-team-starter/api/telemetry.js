import { configuration } from '../lib/supabase.js';
import { readBoundedBody } from '../lib/request-body.js';
import { AccountError } from '../lib/account.js';
import { hasAiAccess } from '../lib/ai-access.js';
import { validateHeartbeat, hashMonitorToken, verifyEnvMonitorToken } from '../lib/telemetry.js';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

export async function POST(request) {
  const config = configuration();
  if (!config) return json({ ok: false }, 503);
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') return json({ ok: false }, 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return json({ ok: false }, 415);
  let body;
  try {
    const raw = await readBoundedBody(request, 2048);
    body = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, error.status);
    return json({ error: 'Некорректные данные.' }, 400);
  }
  const payload = validateHeartbeat(body);
  if (!payload) return json({ error: 'Некорректные параметры телеметрии.' }, 400);
  try {
    // Vercel overwrites this header. Outside Vercel all traffic shares a bucket;
    // never trust arbitrary forwarding headers as an alternative identity.
    const candidate = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.trim() : '';
    const ip = isIP(candidate || '') ? candidate : 'unknown';
    const key = createHmac('sha256', config.key).update(new Date().toISOString().slice(0, 10) + ':' + ip).digest('hex');
    const response = await fetch(`${config.base}/rest/v1/rpc/record_limited_site_heartbeat`, {
      method: 'POST',
      headers: {
        apikey: config.key,
        ...(!config.key.startsWith('sb_') ? { Authorization: `Bearer ${config.key}` } : {}),
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        p_client_key: key,
        p_session_id: payload.sessionId,
        p_visitor_id: payload.visitorId,
        p_path: payload.path,
        p_device: payload.device,
        p_is_pageview: payload.isPageview
      }),
      cache: 'no-store', signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return json({ ok: false }, 502);
    if ((await response.json())?.allowed !== true) return json({ ok: false }, 429);
    return json({ ok: true }, 200);
  } catch (_) {
    return json({ ok: false }, 502);
  }
}

export async function GET(request) {
  const config = configuration();
  if (!config) return json({ error: 'Сервер пока не настроен.' }, 503);
  const monitorKey = request.headers.get('x-monitor-key')?.trim() || '';
  const envOrAdmin = verifyEnvMonitorToken(monitorKey) || (await hasAiAccess(request, config));
  if (!envOrAdmin && monitorKey.length < 16) {
    return json({ error: 'Доступ запрещён.' }, 401);
  }
  const tokenHash = envOrAdmin ? null : hashMonitorToken(monitorKey);
  try {
    const response = await fetch(`${config.base}/rest/v1/rpc/get_site_telemetry_summary`, {
      method: 'POST',
      headers: {
        apikey: config.key,
        ...(!config.key.startsWith('sb_') ? { Authorization: `Bearer ${config.key}` } : {}),
        'content-type': 'application/json'
      },
      body: JSON.stringify({ p_token_hash: tokenHash }),
      cache: 'no-store'
    });
    if (!response.ok) return json({ error: 'Не удалось получить статистику.' }, 502);
    const result = await response.json();
    if (!result || result.authorized === false) {
      return json({ error: 'Неверный ключ доступа.' }, 401);
    }
    return json(result, 200);
  } catch (_) {
    return json({ error: 'Сервер временно недоступен.' }, 502);
  }
}
