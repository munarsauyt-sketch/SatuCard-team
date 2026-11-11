import { randomUUID } from 'node:crypto';
import { configuration } from '../lib/supabase.js';
import { readAccount, AccountError, accountJson as json, accountFailure } from '../lib/account.js';
import { newFonts, newTemplates, projectId, readProjectBody, validateProject } from '../lib/projects.js';

const fields = 'id,title,updated_at,version,thumbnail,archived';
const metadata = row => ({ id: row.id, title: row.title, updatedAt: row.updated_at, version: row.version, thumbnail: row.thumbnail || null, archived: row.archived === true });
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
    const params = new URL(request.url).searchParams;
    const id = params.get('id');
    const offset = Number(params.get('offset') || 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new AccountError('Неверная страница проектов.', 400, 'invalid_page');
    if (id !== null && !projectId(id)) throw new AccountError('Неверный номер проекта.', 400, 'invalid_project_id');
    const query = new URLSearchParams({ user_id: `eq.${user.id}`, select: id ? `${fields},payload` : fields, order: 'updated_at.desc,id.desc', limit: id ? '1' : '50' });
    if (id) query.set('id', `eq.${id}`);
    else {
      query.set('offset', String(offset));
      query.set('archived', params.get('archived') === '1' ? 'eq.true' : 'eq.false');
      const search = (params.get('q') || '').trim().slice(0, 80).replace(/[%_*(),\\]/g, '');
      if (search) query.set('title', 'ilike.*' + search + '*');
    }
    const result = await rows(await fetch(`${config.base}/rest/v1/editable_projects?${query}`, { headers: { apikey: config.key }, cache: 'no-store' }));
    if (!id) return json({ projects: result.map(metadata), nextOffset: result.length === 50 ? offset + 50 : null });
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
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['id', 'title', 'version', 'payload', 'thumbnail', 'archived'].includes(key))) throw new AccountError('Неверные данные проекта.', 400, 'invalid_project');
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || [...title].length > 80 || (body.id !== undefined && !projectId(body.id)) || (body.id !== undefined ? !Number.isSafeInteger(body.version) || body.version < 1 || body.version >= 2147483647 : body.version !== undefined)) throw new AccountError('Проверьте название и версию проекта.', 400, 'invalid_project');
    const payload = validateProject(body.payload);
    if (body.thumbnail !== undefined && (typeof body.thumbnail !== 'string' || body.thumbnail.length > 70000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(body.thumbnail))) throw new AccountError('Неверное превью проекта.', 400, 'invalid_thumbnail');
    if (body.archived !== undefined && typeof body.archived !== 'boolean') throw new AccountError('Неверный статус проекта.', 400, 'invalid_project');
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
    if (body.thumbnail !== undefined) record.thumbnail = body.thumbnail;
    if (body.archived !== undefined) record.archived = body.archived;
    const result = await rows(await fetch(`${config.base}/rest/v1/editable_projects?${query}`, {
      method: body.id === undefined ? 'POST' : 'PATCH', headers: { apikey: config.key, 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify(record), cache: 'no-store'
    }));
    if (!result[0]) throw new AccountError('Проект изменён в другой вкладке или недоступен. Откройте его заново либо сохраните копию.', 409, 'version_conflict');
    return json({ project: metadata(result[0]) }, body.id === undefined ? 201 : 200);
  } catch (error) { return accountFailure(error); }
}

export async function DELETE(request) {
  try {
    const config = configOrThrow();
    const { user } = await readAccount(request, config, { complete: true });
    const params = new URL(request.url).searchParams;
    const id = params.get('id');
    const version = Number(params.get('version'));
    if (!projectId(id) || !Number.isSafeInteger(version) || version < 1) throw new AccountError('Проверьте проект и его версию.', 400, 'invalid_project');
    const query = new URLSearchParams({ id: 'eq.' + id, user_id: 'eq.' + user.id, version: 'eq.' + version, select: 'id' });
    const deleted = await rows(await fetch(config.base + '/rest/v1/editable_projects?' + query, {
      method: 'DELETE', headers: { apikey: config.key, prefer: 'return=representation' }, cache: 'no-store'
    }));
    if (!deleted.length) throw new AccountError('Проект изменён или уже удалён. Обновите список.', 409, 'version_conflict');
    return json({ deleted: true });
  } catch (error) { return accountFailure(error); }
}
