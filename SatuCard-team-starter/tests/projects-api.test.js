import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GET, POST } from '../api/projects.js';
import { MAX_PROJECT_BYTES } from '../lib/projects.js';
const originalFetch = globalThis.fetch;
const env = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY, vercel: process.env.VERCEL_ENV };
const uid = 'aaac8be7-1386-45b8-8d49-3f9d7f5c9fb6';
const id = 'bbbc8be7-1386-45b8-8d49-3f9d7f5c9fb6';
const payload = () => ({ app: 'SatuCard', schemaVersion: 1, settings: { title: 'Тауар', format: 'square', photo: { zoom: 1 } }, photo: null, logo: null });
const row = () => ({ id, title: 'Тауар', version: 1, updated_at: '2026-11-08T00:00:00Z', payload: payload() });
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of [['SUPABASE_URL', env.url], ['SUPABASE_SECRET_KEY', env.key], ['VERCEL_ENV', env.vercel]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
function setup({ auth = true, complete = true, confirmed = true, reply = [row()], status = 200, fail = false } = {}) {
  process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_SECRET_KEY = 'service-secret';
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: uid, email_confirmed_at: confirmed ? 'today' : null }, { status: auth ? 200 : 401 });
    if (String(url).includes('/profiles?')) return Response.json([{ id: uid, profile_completed_at: complete ? 'today' : null }]);
    calls.push({ url: new URL(url), ...options });
    if (fail) throw new Error('network');
    return Response.json(reply, { status });
  };
  return calls;
}
function req(body, query = '', extraHeaders = {}) {
  return new Request(`https://app.example/api/projects${query}`, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: 'Bearer test.token', 'content-type': 'application/json', ...extraHeaders }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
}
test('all cloud access requires authenticated confirmed complete account', async () => {
  for (const [options, status] of [[{auth:false},401], [{confirmed:false},403], [{complete:false},403]]) {
    const calls = setup(options);
    assert.equal((await GET(req())).status, status);
    assert.equal((await POST(req({ title: 'Test', payload: payload() }))).status, status);
    assert.equal(calls.length, 0);
  }
});
test('list excludes payload and secrets; read is owner-filtered with service key', async () => {
  const calls = setup();
  const list = await GET(req()); assert.equal(list.status, 200);
  assert.deepEqual(Object.keys((await list.json()).projects[0]).sort(), ['id','title','updatedAt','version']);
  assert.equal(calls[0].url.searchParams.get('user_id'), `eq.${uid}`);
  assert.equal(calls[0].url.searchParams.get('limit'), '50');
  assert.ok(!calls[0].url.searchParams.get('select').includes('payload'));
  const read = await GET(req(undefined, `?id=${id}`)); assert.deepEqual((await read.json()).project.payload, payload());
  assert.equal(calls[1].url.searchParams.get('user_id'), `eq.${uid}`);
  assert.equal(calls[1].url.searchParams.get('id'), `eq.${id}`);
  assert.equal(read.headers.get('cache-control'), 'no-store');
});
test('missing and foreign project IDs are indistinguishable', async () => {
  setup({ reply: [] });
  const read = await GET(req(undefined, `?id=${id}`)); assert.equal(read.status, 404);
  assert.equal((await read.json()).code, 'project_not_found');
  assert.equal((await GET(req(undefined, '?id=bad&user_id=other'))).status, 400);
});
test('create uses verified owner and update compares version atomically', async () => {
  const calls = setup();
  assert.equal((await POST(req({ title: ' Test ', payload: payload() }))).status, 201);
  const created = JSON.parse(calls[0].body); assert.equal(created.user_id, uid); assert.equal(created.title, 'Test'); assert.equal(created.version, 1);
  assert.equal((await POST(req({ id, version: 3, title: 'Test', payload: payload() }))).status, 200);
  assert.equal(calls[1].method, 'PATCH');
  for (const [key, value] of [['id', id], ['user_id', uid], ['version', 3]]) assert.equal(calls[1].url.searchParams.get(key), `eq.${value}`);
  assert.equal(JSON.parse(calls[1].body).version, 4);
  assert.equal('user_id' in JSON.parse(calls[1].body), false);
});
test('stale updates and foreign IDs cannot overwrite a project', async () => {
  setup({ reply: [] });
  const response = await POST(req({ id, version: 1, title: 'Test', payload: payload() }));
  assert.equal(response.status, 409); assert.equal((await response.json()).code, 'version_conflict');
});
test('preview preserves shared-project compatibility when saving new photo settings', async () => {
  const calls = setup();
  process.env.VERCEL_ENV = 'preview';
  const p = payload();
  p.views = [{ id: 'main', label: 'Главная', settings: { photo: { warmth: 0, blur: 6 } } }];
  p.activeViewId = 'main';
  const preview = await POST(req({ title: 'Test', payload: p }));
  assert.equal(preview.status, 409);
  assert.equal((await preview.json()).code, 'preview_photo_effects_local');
  assert.equal(calls.length, 0);
  p.settings.photo.warmth = 0;
  p.views[0].settings.photo.blur = 0;
  assert.equal((await POST(req({ title: 'Test', payload: p }))).status, 201);
  const stored = JSON.parse(calls[0].body).payload;
  assert.deepEqual(stored.settings.photo, { zoom: 1 });
  assert.deepEqual(stored.views[0].settings.photo, {});
  process.env.VERCEL_ENV = 'production';
  p.views[0].settings.photo = { warmth: 35, blur: 6 };
  assert.equal((await POST(req({ title: 'Test', payload: p }))).status, 201);
  assert.deepEqual(JSON.parse(calls[1].body).payload.views[0].settings.photo, { warmth: 35, blur: 6 });
  p.views[0].settings.photo.blur = 13;
  assert.equal((await POST(req({ title: 'Test', payload: p }))).status, 400);
  assert.equal(calls.length, 2);
});
test('rejects malformed projects, ownership injection, executable/remote media, invalid settings and versions', async () => {
  const calls = setup();
  const badPayloads = [null, {...payload(), schemaVersion: 2}, {...payload(), photo: 'https://evil.test/photo.png'}, {...payload(), logo:'data:image/svg+xml;base64,PHN2Zz4='}, {...payload(), photo:'data:image/png;base64,aGVsbG8='}, {...payload(), settings: {format:'evil'}}, {...payload(), settings: {photo:{zoom:99}}}, {...payload(), settings: JSON.parse('{"__proto__":{}}')}, {...payload(), views: Array(9).fill({id:'a',label:'A',settings:{}})}, {...payload(), activeViewId:'missing'}];
  for (const p of badPayloads) assert.equal((await POST(req({title:'Test',payload:p}))).status, 400);
  for (const extra of [{user_id:uid},{version:1},{id},{id,version:0},{id,version:'1'},{id,version:2147483647}]) assert.equal((await POST(req({title:'Test',payload:payload(),...extra}))).status, 400);
  assert.equal((await POST(req('{bad'))).status, 400);
  assert.equal((await POST(req({title:'x',payload:payload()}, '', {'content-type':'text/plain'}))).status, 415);
  assert.equal(calls.length, 0);
});
test('accepts portable raster project and bounded optional views', async () => {
  const calls = setup();
  const p = payload(); p.photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAkoAAAAASUVORK5CYII=';
  p.views = [{id:'main',label:'Басты',settings:p.settings}]; p.activeViewId='main'; p.savedAt = new Date().toISOString();
  assert.equal((await POST(req({title:'Test',payload:p}))).status, 201); assert.equal(calls.length, 1);
  p.views.push({...p.views[0]}); assert.equal((await POST(req({title:'Test',payload:p}))).status, 400);
  p.views.pop();
  delete p.activeViewId; assert.equal((await POST(req({title:'Test',payload:p}))).status, 400);
  p.activeViewId = p.views[0].id = 'a'.repeat(64); p.views[0].label = 'Б'.repeat(60);
  assert.equal((await POST(req({title:'Test',payload:p}))).status, 201);
  p.activeViewId = p.views[0].id = 'a'.repeat(65);
  assert.equal((await POST(req({title:'Test',payload:p}))).status, 400);
  p.activeViewId = p.views[0].id = 'main'; p.views[0].label = 'Б'.repeat(61);
  assert.equal((await POST(req({title:'Test',payload:p}))).status, 400);
});
test('enforces actual UTF-8 request bytes and declared size before writing', async () => {
  const calls = setup();
  assert.equal((await POST(req(' '.repeat(MAX_PROJECT_BYTES + 1)))).status, 413);
  assert.equal((await POST(req('я'.repeat(MAX_PROJECT_BYTES / 2 + 1)))).status, 413);
  assert.equal((await POST(req('{}', '', {'content-length':String(MAX_PROJECT_BYTES + 1)}))).status, 413);
  assert.equal(calls.length, 0);
});
test('reports missing migration and service failures without upstream details', async () => {
  for (const code of ['42P01', 'PGRST205', 'PGRST204']) {
    setup({status:404,reply:{code,message:'private details'}});
    const response = await GET(req()); assert.equal(response.status, 503); assert.equal((await response.json()).code,'projects_unavailable');
  }
  setup({fail:true}); assert.equal((await GET(req())).status, 502);
  setup({status:500,reply:{message:'secret'}}); const response = await POST(req({title:'Test',payload:payload()})); assert.equal(response.status, 502); assert.ok(!(await response.text()).includes('secret'));
  delete process.env.SUPABASE_SECRET_KEY; assert.equal((await GET(req())).status, 503);
});
test('migration keeps cloud payloads private and guards ownership/version', () => {
  const sql = readFileSync(new URL('../database/editable-projects.sql', import.meta.url), 'utf8');
  assert.match(sql, /octet_length\(payload::text\) <= 3565536/);
  assert.equal(MAX_PROJECT_BYTES, 3_500_000);
  assert.match(sql, /force row level security/); assert.match(sql, /revoke all on public.editable_projects from public, anon, authenticated/);
  assert.match(sql, /auth.uid\(\) = user_id/); assert.match(sql, /new.version <> old.version \+ 1/); assert.match(sql, /new.user_id is distinct from old.user_id/);
});

test('cloud v2 preserves media references and validates strict fields and bounds', async () => {
  const calls = setup();
  const source = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAkoAAAAASUVORK5CYII=';
  const p = {app:'SatuCard',schemaVersion:2,settings:{format:'portrait34',purpose:'dimensions',category:'electronics'},photos:[{id:'front',source}],logo:null,views:[{id:'main',label:'Main',settings:{format:'portrait34',purpose:'dimensions',category:'electronics'},photoIds:['front']}],activeViewId:'main'};
  assert.equal((await POST(req({title:'Test',payload:p}))).status,201);
  assert.deepEqual(JSON.parse(calls[0].body).payload,p);
  for (const change of [
    {photo:null}, {photos:[p.photos[0],p.photos[0]]}, {photos:[{id:'bad id',source}]}, {photos:[{id:'front',source,extra:true}]},
    {photos:[{id:'front',source:null}]}, {photos:[{id:'front',source:'data:image/png;base64,aGVsbG8='}]},
    {photos:Array.from({length:13},(_,i)=>({id:`p${i}`,source}))},
    {views:[{...p.views[0],photoIds:['unknown']}]}, {views:[{...p.views[0],photoIds:['front','front']}]},
    {views:[{...p.views[0],photoIds:['front','front','front','front']}]}, {views:[{...p.views[0],photoIds:undefined}]},
    {views:undefined}, {settings:{purpose:'unknown'}}, {settings:{category:'unknown'}}, {settings:{unknown:'bad'}}
  ]) assert.equal((await POST(req({title:'Test',payload:{...p,...change}}))).status,400);
  p.photos=[];p.views[0].photoIds=[];
  assert.equal((await POST(req({title:'Empty',payload:p}))).status,201);
});

test('multi-photo migration preserves legacy projects and permits private v2 payloads', () => {
  const sql = readFileSync(new URL('../database/multi-photo-studio.sql', import.meta.url), 'utf8');
  assert.match(sql,/cards_format_check check \(format in \('portrait', 'portrait34'/);
  assert.match(sql,/drop constraint if exists editable_projects_payload_check/);
  assert.match(sql,/"schemaVersion":1/); assert.match(sql,/"schemaVersion":2/);
  assert.match(sql,/not \(payload \? 'photo'\)/);
  assert.match(sql,/octet_length\(payload::text\) <= 3565536/);
  assert.doesNotMatch(sql,/disable row level security|grant .*anon/i);
});
