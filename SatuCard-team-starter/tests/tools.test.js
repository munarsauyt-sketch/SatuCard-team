import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const sandbox = { Uint8Array, Uint8ClampedArray, Uint32Array, DataView, TextEncoder };
vm.runInNewContext(fs.readFileSync(new URL('../studio-tools.js', import.meta.url), 'utf8'), sandbox);
const tools = sandbox.SATUCARD_TOOLS;
function fixture() {
  const bytes = new Uint8ClampedArray(7 * 7 * 4).fill(255);
  for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) {
    if (x === 3 && y === 3) continue;
    bytes.set([0, 0, 0, 255], (y * 7 + x) * 4);
  }
  return bytes;
}
test('background flood fill preserves closed interior and source', () => {
  const input = fixture();
  const copy = input.slice();
  const result = tools.removeBackground(input, 7, 7, 32);
  assert.equal(result.data[3], 0);
  assert.equal(result.data[(3 * 7 + 3) * 4 + 3], 255);
  assert.equal(result.data[(2 * 7 + 3) * 4 + 3], 255);
  assert.equal(result.removedPixels, 40);
  assert.deepEqual(input, copy);
});
test('existing alpha is preserved inside object; transparent border is traversed', () => {
  const input = fixture();
  input[3] = 0;
  input[(3 * 7 + 3) * 4 + 3] = 99;
  const result = tools.removeBackground({ data: input }, 7, 7);
  assert.equal(result.data[(3 * 7 + 3) * 4 + 3], 99);
  assert.equal(result.removedPixels, 39);
});
test('unsuitable backgrounds and dimensions fail helpfully without mutation', () => {
  assert.throws(() => tools.removeBackground(new Uint8Array(4), 1, 1), /RGBA/);
  assert.throws(() => tools.removeBackground(new Uint8Array(196), 7, 7), /прозрачные/);
  assert.throws(() => tools.removeBackground(new Uint8Array(196).fill(255), 7, 7), /Почти всё/);
  const bytes = fixture();
  for (let x = 0; x < 7; x++) bytes.set([0, 0, 0, 255], x * 4);
  assert.throws(() => tools.removeBackground(bytes, 7, 7), /неоднородный/);
});
test('ZIP CRC32 matches known vector and Unicode name is UTF-8 flagged', () => {
  const bytes = new TextEncoder().encode('123456789');
  assert.equal(tools.crc32(bytes), 0xcbf43926);
  const name = 'тауар-товар.png';
  const zip = tools.createZip([{ name, bytes }, { name: 'empty.txt', bytes: new Uint8Array() }]);
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(6, true), 0x800);
  assert.equal(view.getUint16(8, true), 0);
  assert.equal(view.getUint32(14, true), 0xcbf43926);
  const length = view.getUint16(26, true);
  assert.equal(new TextDecoder().decode(zip.slice(30, 30 + length)), name);
  assert.deepEqual(zip.slice(30 + length, 39 + length), bytes);
  const end = zip.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 2);
  const central = view.getUint32(end + 16, true);
  assert.equal(view.getUint32(central, true), 0x02014b50);
  assert.equal(view.getUint16(central + 8, true), 0x800);
  assert.equal(view.getUint32(central + 42, true), 0);
});
test('ZIP rejects unsafe or duplicate entry names', () => {
  for (const name of ['../photo.png', '/photo.png', 'a\\b', 'a/../b']) assert.throws(() => tools.createZip([{ name, bytes: new Uint8Array() }]));
  assert.throws(() => tools.createZip([{ name: 'a', bytes: new Uint8Array() }, { name: 'a', bytes: new Uint8Array() }]));
  assert.equal(tools.createZip([]).length, 22);
});
const metadata = { width: 900, height: 1200, bytes: 500000, mime: 'image/png', photoWidth: 1500, photoHeight: 2000, hasPhoto: true, hasLogo: false };
test('preflight distinguishes suggestions from official requirements', () => {
  for (const marketplace of ['general', 'kaspi', 'wildberries', 'ozon']) {
    const result = tools.preflight({}, metadata, marketplace);
    assert.equal(result.marketplace, marketplace);
    assert.equal(result.ok, true);
    assert.match(result.disclaimer, /не официальные/);
    assert.ok(result.checks.some(c => c.id === 'category-review'));
  }
  assert.equal(tools.preflight({}, metadata, 'unknown').marketplace, 'general');
});
test('preflight reports missing image, mismatch, resolution, file size and promotional risks', () => {
  const result = tools.preflight({ price: 500, badge: 'SALE', brandName: 'Brand', title: 'x'.repeat(55) }, { ...metadata, hasPhoto: false, width: 600, bytes: 12000000 }, 'kaspi');
  assert.equal(result.ok, false);
  for (const id of ['dimensions', 'aspect', 'file-size', 'photo', 'price', 'badge', 'brand', 'text']) assert.ok(result.checks.some(c => c.id === id && ['warning', 'error'].includes(c.severity)));
  assert.ok(tools.preflight({}, { ...metadata, photoWidth: 200 }, 'general').checks.some(c => c.id === 'photo-resolution' && c.severity === 'warning'));
});
test('hidden prices and branding do not trigger warnings', () => {
  const result = tools.preflight({ price: 100, showPrice: false, brandName: 'Brand', showBrand: false }, metadata);
  assert.ok(!result.checks.some(c => ['price', 'brand'].includes(c.id)));
});

test('title recommendations use measured preview size and contrast', () => {
  const shortTitle = { title: 'Чашка' };
  const issues = report => report.checks.filter(check => check.id.startsWith('title-')).map(check => check.id);
  assert.equal(issues(tools.preflight(shortTitle, metadata)).length, 0);
  assert.equal(issues(tools.preflight(shortTitle, { ...metadata, titlePreviewSize: 20, titleContrast: 4 })).length, 0);
  assert.equal(issues(tools.preflight(shortTitle, { ...metadata, titlePreviewSize: 14.5, titleContrast: 1.2 })).join(','), 'title-size,title-contrast');
  assert.equal(issues(tools.preflight({ title: '' }, { ...metadata, titlePreviewSize: 14.5, titleContrast: 1.2 })).join(','), 'title-missing');
});
