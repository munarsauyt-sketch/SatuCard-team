import { createHash, timingSafeEqual } from 'node:crypto';

export const ALLOWED_PATHS = new Set([
  '/index.html',
  '/editor.html',
  '/video.html',
  '/examples.html',
  '/pricing.html',
  '/guide.html',
  '/video-guide.html',
  '/dashboard.html',
  '/auth.html',
  '/card.html',
  '/profile.html'
]);

const ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
const DEVICES = new Set(['mobile', 'tablet', 'desktop']);

/**
 * Normalize a page path and ensure it belongs to the allowlisted site routes.
 */
export function normalizePagePath(rawPath) {
  if (typeof rawPath !== 'string') return null;
  const clean = rawPath.split('?')[0].split('#')[0].trim();
  const normalized = clean === '' || clean === '/' ? '/index.html' : (clean.startsWith('/') ? clean : '/' + clean);
  return ALLOWED_PATHS.has(normalized) ? normalized : null;
}

/**
 * Validate and normalize an incoming browser heartbeat payload.
 */
export function validateHeartbeat(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const visitorId = typeof body.visitorId === 'string' ? body.visitorId.trim() : '';
  if (!ID_PATTERN.test(sessionId) || !ID_PATTERN.test(visitorId)) return null;
  const path = normalizePagePath(body.path);
  if (!path) return null;
  const device = typeof body.device === 'string' ? body.device.trim() : '';
  if (!DEVICES.has(device)) return null;
  return {
    sessionId,
    visitorId,
    path,
    device,
    isPageview: Boolean(body.isPageview)
  };
}

/**
 * Hash a monitor secret token using SHA-256 hex digest.
 */
export function hashMonitorToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

/**
 * Compare a supplied monitor key against SATUCARD_MONITOR_KEY env var safely.
 */
export function verifyEnvMonitorToken(token) {
  const expected = process.env.SATUCARD_MONITOR_KEY?.trim();
  if (!expected || typeof token !== 'string' || !token.trim()) return false;
  const a = Buffer.from(token.trim(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
