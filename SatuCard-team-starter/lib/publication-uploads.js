// Durable upload journal: a network failure must not make an untracked object
// or delete an image whose metadata actually committed in PostgreSQL.
export async function journalUpload(config, entry) {
  const response = await fetch(config.base + '/rest/v1/card_publication_uploads', {
    method: 'POST', headers: { apikey: config.key, 'content-type': 'application/json', prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify(entry), signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Publication journal unavailable');
}
export async function forgetUpload(config, imagePath) {
  const query = new URLSearchParams({ image_path: 'eq.' + imagePath });
  return fetch(config.base + '/rest/v1/card_publication_uploads?' + query, { method: 'DELETE', headers: { apikey: config.key }, signal: AbortSignal.timeout(8000) }).catch(() => null);
}
export async function removeUpload(config, imagePath) {
  const response = await fetch(config.base + '/storage/v1/object/cards/' + encodeURIComponent(imagePath), {
    method: 'DELETE', headers: { apikey: config.key }, signal: AbortSignal.timeout(8000)
  }).catch(() => null);
  if (response?.ok || response?.status === 404) return Boolean((await forgetUpload(config, imagePath))?.ok);
  return false;
}
export async function reconcileUpload(config, id, userId, imagePath) {
  try {
    const query = new URLSearchParams({ id: 'eq.' + id, user_id: 'eq.' + userId, select: 'id,image_path', limit: '1' });
    const response = await fetch(config.base + '/rest/v1/cards?' + query, { headers: { apikey: config.key }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return 'unknown';
    const rows = await response.json();
    if (!Array.isArray(rows)) return 'unknown';
    if (rows[0]?.image_path === imagePath) { await forgetUpload(config, imagePath); return 'committed'; }
    await removeUpload(config, imagePath);
    return 'absent';
  } catch (_) { return 'unknown'; }
}
