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
