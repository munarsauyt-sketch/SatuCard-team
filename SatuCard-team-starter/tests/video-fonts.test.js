import test from 'node:test';
import assert from 'node:assert/strict';

test('project fonts include Kazakh glyphs, load only needed faces, and retry failed loads', async () => {
  const previous = globalThis.document;
  const calls = [];
  let fail = true;
  globalThis.document = { fonts: { load: async (face, text) => {
    calls.push({ face, text });
    if (face.includes('Noto') && fail) throw new Error('Network unavailable');
    return [{}];
  } } };
  try {
    const { loadProjectFonts } = await import('../video-fonts.js');
    const project = { layers: [{ type: 'text', font: 'Golos Text', weight: 700 }, { type: 'text', font: 'Noto Serif', hidden: true }, { type: 'shape' }] };
    await Promise.all([loadProjectFonts(project), loadProjectFonts(project)]);
    assert.equal(calls.length, 1); assert.match(calls[0].text, /ӘәҒғҚқҢңӨөҰұҮүҺһІі/);
    project.layers[1].hidden = false;
    await assert.rejects(loadProjectFonts(project), /Шрифт не загрузился/);
    fail = false;
    await loadProjectFonts(project);
    assert.equal(calls.filter(call => call.face.includes('Golos')).length, 1);
    assert.equal(calls.filter(call => call.face.includes('Noto')).length, 2);
  } finally {
    if (previous === undefined) delete globalThis.document; else globalThis.document = previous;
  }
});
