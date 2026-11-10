import { randomUUID } from 'node:crypto';
import { configuration } from '../lib/supabase.js';
import { readAccount, AccountError, accountJson as json, accountFailure } from '../lib/account.js';
import { newFonts, newTemplates, projectId, readProjectBody, validateProject } from '../lib/projects.js';

const fields = 'id,title,updated_at,version';
const metadata = row => ({ id: row.id, title: row.title, updatedAt: row.updated_at, version: row.version });
function configOrThrow() {
  const config = configuration();
  if (!config) throw new AccountError('Облачные проекты пока не настроены.', 503, 'projects_unavailable');
  return config;
}
async function rows(response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (['42P01', 'PGRST205', '42703', 'PGRST204'].includes(error.code)) throw new AccountError('Хранилище проектов ещё не настроено. Сохраните проект на устройство.', 503, 'projects_unavailable');
    throw new Error('Project service failure');
  }
  const result = await response.json();
  if (!Array.isArray(result)) throw new Error('Invalid project service response');
  return result;
}
export async function GET(request) {
  try {
    const config = configOrThrow();
    const { user } = await readAccount(request, config, { complete: true });
    const id = new URL(request.url).searchParams.get('id');
    if (id !== null && !projectId(id)) throw new AccountError('Неверный номер проекта.', 400, 'invalid_project_id');
    const query = new URLSearchParams({ user_id: `eq.${user.id}`, select: id ? `${fields},payload` : fields, order: 'updated_at.desc,id.desc', limit: id ? '1' : '50' });
    if (id) query.set('id', `eq.${id}`);
    const result = await rows(await fetch(`${config.base}/rest/v1/editable_projects?${query}`, { headers: { apikey: config.key }, cache: 'no-store' }));
    if (!id) return json({ projects: result.map(metadata) });
    if (!result[0]) throw new AccountError('Проект не найден.', 404, 'project_not_found');
    return json({ project: { ...metadata(result[0]), payload: validateProject(result[0].payload) } });
  } catch (error) { return accountFailure(error); }
}
export async function POST(request) {
  try {
    const config = configOrThrow();
    const { user } = await readAccount(request, config, { complete: true });
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw new AccountError('Нужен JSON проекта.', 415, 'invalid_content_type');
    const body = await readProjectBody(request);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['id', 'title', 'version', 'payload'].includes(key))) throw new AccountError('Неверные данные проекта.', 400, 'invalid_project');
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || [...title].length > 80 || (body.id !== undefined && !projectId(body.id)) || (body.id !== undefined ? !Number.isSafeInteger(body.version) || body.version < 1 || body.version >= 2147483647 : body.version !== undefined)) throw new AccountError('Проверьте название и версию проекта.', 400, 'invalid_project');
    const payload = validateProject(body.payload);
    if (process.env.VERCEL_ENV === 'preview') {
      // Preview and Production can share storage. Older versions cannot read these settings.
      const settings = [payload.settings, ...(payload.views || []).map(view => view.settings)];
      if (settings.some(entry => newFonts.includes(entry.font) || newTemplates.includes(entry.template))) {
        throw new AccountError('Скачайте файл проекта, чтобы сохранить новые шрифты и шаблоны черновика.', 409, 'preview_design_local');
      }
      const photos = settings.map(entry => entry.photo).filter(Boolean);
      if (photos.some(photo => photo.warmth || photo.blur)) {
        throw new AccountError('Скачайте проект, чтобы сохранить новые эффекты.', 409, 'preview_photo_effects_local');
      }
      for (const photo of photos) {
        delete photo.warmth;
        delete photo.blur;
      }
    }
    const query = new URLSearchParams({ select: fields });
    let record;
    if (body.id !== undefined) {
      // Atomic compare-and-swap: ownership AND last observed version are in the
      // same UPDATE, even though the service key bypasses RLS.
      query.set('id', `eq.${body.id}`); query.set('user_id', `eq.${user.id}`); query.set('version', `eq.${body.version}`);
      record = { title, payload, version: body.version + 1 };
    } else record = { id: randomUUID(), user_id: user.id, title, payload, version: 1 };
    const result = await rows(await fetch(`${config.base}/rest/v1/editable_projects?${query}`, {
      method: body.id === undefined ? 'POST' : 'PATCH', headers: { apikey: config.key, 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify(record), cache: 'no-store'
    }));
    if (!result[0]) throw new AccountError('Проект изменён в другой вкладке или недоступен. Откройте его заново либо сохраните копию.', 409, 'version_conflict');
    return json({ project: metadata(result[0]) }, body.id === undefined ? 201 : 200);
  } catch (error) { return accountFailure(error); }
}
