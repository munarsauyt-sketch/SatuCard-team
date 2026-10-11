import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const runtime = { Intl };
vm.runInNewContext(readFileSync(new URL('../studio-renderer.js', import.meta.url), 'utf8'), runtime);
const renderer = runtime.SATUCARD_RENDERER;

function fakeCanvas() {
  const operations = [], text = [], images = [], stack = [];
  let transform = [1, 0, 0, 1, 0, 0];
  const context = {
    font: '16px Arial', fillStyle: '#000000', textAlign: 'left', textBaseline: 'top', filter: 'none',
    measureText(value) {
      const size = Number(this.font.match(/([\d.]+)px/)[1]);
      const width = [...String(value)].reduce((sum, char) => sum + (char === ' ' ? 0.28 : /[A-ZА-ЯЁ]/u.test(char) ? 0.64 : 0.54) * size, 0);
      return { width };
    },
    fillText(value, x, y) { text.push({ value: String(value), x, y, width: this.measureText(value).width, size: Number(this.font.match(/([\d.]+)px/)[1]), align: this.textAlign, baseline: this.textBaseline }); },
    drawImage(image, ...args) { images.push({ image, args, transform: [...transform], filter: this.filter }); },
    setTransform(...args) { transform = args; },
    translate(x, y) { const [a, b, c, d, e, f] = transform; transform = [a, b, c, d, e + a * x + c * y, f + b * x + d * y]; },
    scale(x, y) { const [a, b, c, d, e, f] = transform; transform = [a * x, b * x, c * y, d * y, e, f]; },
    rotate(angle) { const [a, b, c, d, e, f] = transform; const cos = Math.cos(angle), sin = Math.sin(angle); transform = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, e, f]; },
    save() { stack.push({ transform: [...transform], font: this.font, filter: this.filter, textAlign: this.textAlign, textBaseline: this.textBaseline }); },
    restore() { const saved = stack.pop(); assert.ok(saved, 'balanced canvas save/restore'); transform = saved.transform; Object.assign(this, saved); },
    createLinearGradient(...args) { operations.push(args); return { addColorStop() {} }; },
    createRadialGradient(...args) { operations.push(args); return { addColorStop() {} }; }
  };
  for (const method of ['beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'closePath', 'fill', 'stroke', 'arc', 'clip', 'fillRect', 'clearRect']) {
    context[method] = (...args) => { operations.push(args); };
  }
  return { canvas: { width: 0, height: 0, getContext: () => context }, context, operations, text, images, stack };
}

test('normalizes imported or restored settings without mutating them', () => {
  const input = {
    title: '  Длинный товар '.repeat(12), description: 'я'.repeat(250), subtitle: 'я'.repeat(130), badge: 'я'.repeat(40),
    features: ['д'.repeat(80), '', 'Обычный текст', 'Лишнее'], brandName: 'ш'.repeat(50),
    price: '24990,00', oldPrice: 100, template: '__proto__', format: 'unknown', customColors: true,
    background: 'url(bad)', accent: '#FF0000', textColor: '#123', font: 'external', textScale: 500, textAlign: 'right',
    photo: { fit: 'broken', zoom: Infinity, x: -200, y: 250, rotation: 999, brightness: 1, contrast: 1000, saturation: -1, radius: 80 }
  };
  const original = JSON.stringify(input);
  const state = renderer.normalize(input);
  assert.equal(JSON.stringify(input), original);
  assert.equal(state.template, 'studio'); assert.equal(state.format, 'portrait');
  assert.equal(state.title.length, 60); assert.equal(state.subtitle.length, 90); assert.equal(state.description.length, 180);
  assert.equal(state.badge.length, 24); assert.equal(state.brandName.length, 28);
  assert.equal(state.features.length, 2); assert.equal(state.features[0].length, 38);
  assert.equal(state.price, null); assert.equal(state.oldPrice, null);
  assert.equal(state.background, renderer.templates.studio.background); assert.equal(state.accent, '#ff0000');
  assert.equal(state.font, 'manrope'); assert.equal(state.textAlign, 'left'); assert.equal(state.textScale, 120);
  assert.equal(state.photo.zoom, 1); assert.equal(state.photo.x, 0); assert.equal(state.photo.y, 100);
  assert.equal(state.photo.rotation, 180); assert.equal(state.photo.brightness, 50); assert.equal(state.photo.contrast, 150);
  assert.equal(state.photo.saturation, 0); assert.equal(state.photo.radius, 50);
  assert.equal(renderer.normalize({ price: 500, oldPrice: 400 }).oldPrice, null);
  assert.equal(renderer.normalize({ price: 500, oldPrice: 600 }).oldPrice, 600);
});

test('all templates and formats keep maximal content and their photo frame within the output', () => {
  for (const template of Object.keys(renderer.templates)) {
    for (const format of Object.keys(renderer.formats)) {
      const scene = fakeCanvas();
      const state = {
        template, format, title: 'Беспроводные полноразмерные наушники для музыки и путешествий',
        subtitle: 'Продуманный дизайн и комфортное прослушивание любимой музыки каждый день в любой поездке',
        description: 'Сохраните свой ритм: мягкие амбушюры, удобная посадка и выразительный внешний вид. Укажите только проверенные характеристики своего товара и расскажите, почему его стоит выбрать покупателю.',
        features: ['Комфортное прослушивание каждый день', 'Быстрая доставка по всему Казахстану', 'Подходит для вашего повседневного ритма'],
        price: 999999999.99, oldPrice: 1000000000, badge: 'Специальное предложение', brandName: 'Магазин товаров Казахстана', textScale: 120
      };
      const result = renderer.render(scene.canvas, state, { photo: { naturalWidth: 1200, naturalHeight: 800 } }, { scale: 2 });
      const rect = result.photoRect;
      assert.equal(scene.canvas.width, 1800); assert.equal(scene.canvas.height, result.height * 2);
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0, `${template}/${format} has a positive frame`);
      assert.ok(rect.x + rect.width <= 900 && rect.y + rect.height <= result.height, `${template}/${format} frame fits`);
      assert.equal(scene.images.length, 1); assert.equal(scene.stack.length, 0);
      assert.ok(scene.operations.flat().filter(value => typeof value === 'number').every(Number.isFinite));
      const renderedWords = scene.text.map(row => row.value).join('').replace(/\s/g, '').toLowerCase();
      const normalized = renderer.normalize(state);
      for (const value of [normalized.title, normalized.subtitle, normalized.description, ...normalized.features]) {
        assert.ok(renderedWords.includes(value.replace(/\s/g, '').toLowerCase()), `${template}/${format} keeps the whole supplied text`);
      }
      for (const row of scene.text) {
        const left = row.align === 'center' ? row.x - row.width / 2 : row.x;
        assert.ok(left >= -1 && left + row.width <= 901, `${template}/${format} text stays within horizontal output: ${row.value}`);
        assert.ok(row.y >= 0 && row.y < result.height, `${template}/${format} text stays within vertical output`);
      }
    }
  }
});

test('photo framing applies position, rotation, flip and filters equally to preview and export', () => {
  const source = { naturalWidth: 1200, naturalHeight: 800 };
  const state = { template: 'neon', photo: { fit: 'contain', zoom: 1.2, x: 100, y: 0, rotation: 90, flip: true, brightness: 110, contrast: 120, saturation: 80 } };
  const preview = fakeCanvas(), output = fakeCanvas();
  const result = renderer.render(preview.canvas, state, { photo: source });
  renderer.render(output.canvas, state, { photo: source }, { scale: 2 });
  const image = preview.images[0], exported = output.images[0];
  assert.equal(image.filter, 'brightness(110%) contrast(120%) saturate(80%)');
  assert.ok(Math.abs(image.transform[4] - result.photoRect.x - result.photoRect.width * 0.85) < 1e-8);
  assert.ok(Math.abs(image.transform[5] - result.photoRect.y - result.photoRect.height * 0.15) < 1e-8);
  assert.ok(image.transform[1] < 0, 'horizontal flip is applied in the rotated coordinate system');
  image.transform.forEach((value, index) => assert.ok(Math.abs(exported.transform[index] - value * 2) < 1e-8));
  assert.deepEqual(exported.args, image.args, 'export uses the same logical geometry');
});

test('empty photos and hidden product metadata still produce a useful composition', () => {
  for (const template of Object.keys(renderer.templates)) {
    const scene = fakeCanvas();
    const result = renderer.render(scene.canvas, { template, showPrice: false, showBrand: false, badge: 'Новинка' });
    assert.ok(result.photoRect.height > 100);
    assert.equal(scene.images.length, 0);
    assert.ok(scene.text.some(row => row.value.includes('Добавьте фотографию')));
    assert.ok(!scene.text.some(row => row.value === 'SatuCard.' || row.value.includes('Цена по запросу')));
    assert.ok(scene.text.some(row => row.value === 'Новинка'));
  }
});

test('rotated contain keeps the entire photo visible and rotated cover leaves no uncovered frame corners', () => {
  for (const rotation of [0, 30, 45, 90, 135, 180]) {
    for (const fit of ['contain', 'cover']) {
      const scene = fakeCanvas();
      const { photoRect: frame } = renderer.render(scene.canvas, { photo: { fit, rotation } }, { photo: { naturalWidth: 1600, naturalHeight: 900 } });
      const { transform: [a, b, c, d, e, f], args: [x, y, width, height] } = scene.images[0];
      if (fit === 'contain') {
        for (const [px, py] of [[x, y], [x + width, y], [x, y + height], [x + width, y + height]]) {
          const globalX = a * px + c * py + e, globalY = b * px + d * py + f;
          assert.ok(globalX >= frame.x - 1e-7 && globalX <= frame.x + frame.width + 1e-7);
          assert.ok(globalY >= frame.y - 1e-7 && globalY <= frame.y + frame.height + 1e-7);
        }
      } else {
        const determinant = a * d - b * c;
        for (const [globalX, globalY] of [[frame.x, frame.y], [frame.x + frame.width, frame.y], [frame.x, frame.y + frame.height], [frame.x + frame.width, frame.y + frame.height]]) {
          const px = (d * (globalX - e) - c * (globalY - f)) / determinant;
          const py = (-b * (globalX - e) + a * (globalY - f)) / determinant;
          assert.ok(px >= x - 1e-7 && px <= x + width + 1e-7, `${rotation}° cover includes horizontal frame corner`);
          assert.ok(py >= y - 1e-7 && py <= y + height + 1e-7, `${rotation}° cover includes vertical frame corner`);
        }
      }
    }
  }
});
