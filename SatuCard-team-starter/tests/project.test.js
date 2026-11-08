import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../studio-project.js', import.meta.url), 'utf8'), context);
const project = context.SATUCARD_PROJECT;
const copy = value => JSON.parse(JSON.stringify(value));

test('history keeps asset references, drops redo after an edit and respects its limit', () => {
  const history = project.createHistory({ settings: { title: 'A' }, photoId: 'photo1' }, 3);
  history.push({ settings: { title: 'B' }, photoId: 'photo2' });
  history.push({ settings: { title: 'C' }, photoId: 'photo2' });
  assert.equal(history.undo().settings.title, 'B');
  assert.equal(history.canRedo, true);
  history.push({ settings: { title: 'D' }, photoId: 'photo3' });
  assert.equal(history.canRedo, false);
  history.push({ settings: { title: 'E' }, photoId: 'photo4' });
  assert.equal(history.retained().length, 3);
  assert.equal(history.undo().settings.title, 'D');
  assert.equal(history.undo().settings.title, 'B');
  assert.equal(history.canUndo, false);
  assert.equal(history.redo().photoId, 'photo3');
});

test('project round-trip retains settings and image data', () => {
  const settings = { template: 'neon', format: 'story', title: 'Наушники', photo: { zoom: 1.8 } };
  const source = 'data:image/png;base64,aGVsbG8=';
  const text = project.serializeProject(settings, source, null);
  const restored = project.parseProject(text, value => copy(value));
  assert.deepEqual(copy(restored), { settings, photo: source, logo: null });
});

test('untrusted projects cannot load remote or executable images', () => {
  const base = { app: 'SatuCard', schemaVersion: 1, settings: {}, photo: null, logo: null };
  for (const photo of ['https://example.com/photo.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)']) {
    assert.throws(() => project.parseProject(JSON.stringify({ ...base, photo }), copy), /Неподдерживаемый/);
  }
  assert.throws(() => project.parseProject('{bad', copy), /корректный/);
  assert.throws(() => project.parseProject(JSON.stringify({ ...base, schemaVersion: 2 }), copy), /Неподдерживаемый/);
});

test('multi-card projects round-trip active view and reject malformed sets', () => {
  const views = [{ id: 'main', label: 'Главная', settings: { title: 'A' } }, { id: 'details', label: 'Толығырақ', settings: { title: 'B' } }];
  const text = project.serializeProject({ title: 'stale' }, null, null, { views, activeViewId: 'details' });
  const restored = project.parseProject(text, copy);
  assert.equal(restored.settings.title, 'B');
  assert.deepEqual(copy(restored.views), views);
  for (const set of [{ views: [], activeViewId: 'main' }, { views: [...views, views[0]], activeViewId: 'main' }, { views, activeViewId: 'missing' }, { views }, { views: Array(9).fill(views[0]), activeViewId: 'main' }]) {
    assert.throws(() => project.serializeProject({}, null, null, set));
  }
  assert.equal(project.parseProject(project.serializeProject({ title: 'Legacy' }, null, null), copy).settings.title, 'Legacy');
});

test('v2 shares multiple photos across views without duplicated legacy media', () => {
  const photos = [{id:'front',source:'data:image/png;base64,aGVsbG8='},{id:'back',source:'data:image/jpeg;base64,aGVsbG8='}];
  const views = [{id:'main',label:'Главная',settings:{title:'Front',format:'portrait34',purpose:'cover',category:'home'},photoIds:['front','back']},{id:'details',label:'Details',settings:{title:'Back'},photoIds:['back']}];
  const text = project.serializeProject({}, null, null, {photos,views,activeViewId:'main'});
  const payload = JSON.parse(text);
  assert.equal(payload.schemaVersion,2); assert.equal('photo' in payload,false);
  const restored = copy(project.parseProject(text,copy));
  assert.deepEqual(restored,{settings:views[0].settings,photos,logo:null,views,activeViewId:'main'});
  const empty = {photos:[],views:[{...views[0],photoIds:[]}],activeViewId:'main'};
  assert.equal(project.parseProject(project.serializeProject({},null,null,empty),copy).photos.length,0);
  for (const change of [
    {photos:[photos[0],photos[0]]}, {photos:[{...photos[0],id:'../bad'}]}, {photos:Array.from({length:13},(_,i)=>({...photos[0],id:`p${i}`}))},
    {photos:[{...photos[0],source:'https://evil.test/image.png'}]}, {photos:[{...photos[0],source:null}]},
    {views:[{...views[0],photoIds:['missing']}]}, {views:[{...views[0],photoIds:['front','front']}]},
    {views:[{...views[0],photoIds:['front','back','front','back']}]}, {views:[{...views[0],photoIds:undefined}]}, {views:[]}, {photo:null}
  ]) assert.throws(()=>project.parseProject(JSON.stringify({...payload,...change}),copy));
});
