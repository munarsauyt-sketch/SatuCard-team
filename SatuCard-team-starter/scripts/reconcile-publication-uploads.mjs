// Read-only by default. --apply deletes only old, positively unreferenced files.
import { configuration } from '../lib/supabase.js';
import { forgetUpload, removeUpload } from '../lib/publication-uploads.js';

const config = configuration();
if (!config) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');
const apply = process.argv.includes('--apply');
const headers = { apikey: config.key };
const query = new URLSearchParams({ created_at: 'lt.' + new Date(Date.now() - 86400000).toISOString(), order: 'created_at.asc', limit: '100' });
const response = await fetch(config.base + '/rest/v1/card_publication_uploads?' + query, { headers, cache: 'no-store' });
if (!response.ok) throw new Error('Cannot read upload journal');
for (const entry of await response.json()) {
  if (!/^[a-f0-9-]{36}(-[a-f0-9-]{36})?\.jpg$/.test(entry.image_path) || Date.parse(entry.created_at) > Date.now() - 86400000) throw new Error('Invalid journal entry');
  const lookup = await fetch(config.base + '/rest/v1/cards?' + new URLSearchParams({ image_path: 'eq.' + entry.image_path, select: 'id', limit: '1' }), { headers, cache: 'no-store' });
  if (!lookup.ok) throw new Error('Cannot verify image references; no deletion attempted');
  const rows = await lookup.json();
  if (!Array.isArray(rows)) throw new Error('Invalid card lookup');
  console.log(JSON.stringify({ imagePath: entry.image_path, action: rows.length ? 'keep-image-clear-journal' : 'remove-unreferenced-image', apply }));
  if (apply) {
    const complete = rows.length ? (await forgetUpload(config, entry.image_path))?.ok : await removeUpload(config, entry.image_path);
    if (!complete) throw new Error('Cleanup incomplete; journal retained for retry');
  }
}
