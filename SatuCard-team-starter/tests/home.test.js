import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const source = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 30));

test('home keeps one clear route to the editor, templates and instruction without decorative microcopy', () => {
  const dom = new JSDOM(source('index.html'));
  try {
    const hero = dom.window.document.querySelector('.mark-hero');
    assert.equal(hero.querySelectorAll('h1').length, 1);
    assert.equal(hero.querySelectorAll('h1 br, .eyebrow, .mark-hero-notes, .canvas-note').length, 0);
    assert.equal(hero.querySelector('.mark-hero-actions .button').getAttribute('href'), 'editor.html');
    assert.equal(hero.querySelector('.mark-hero-actions .text-link').getAttribute('href'), 'examples.html');
    const help = dom.window.document.getElementById('how-it-works');
    assert.equal(help.querySelector('.intro-guide-link').getAttribute('href'), 'guide.html');
    const video = help.querySelector('video');
    assert.ok(video.hasAttribute('controls'));
    assert.ok(video.hasAttribute('playsinline'));
    assert.ok(!video.hasAttribute('autoplay'));
    assert.equal(video.querySelector('track').getAttribute('kind'), 'captions');
    assert.equal(hero.querySelector('video'), null);
    assert.equal(hero.querySelectorAll('[data-hero-style]').length, 4);
  } finally { dom.window.close(); }
});

test('home styles update the preview, editor link and accessible state', async () => {
  const dom = new JSDOM(source('index.html'), { url: 'https://satucard.test/index.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, renders = [];
  try {
    w.eval(source('product-samples.js'));
    w.SATUCARD_RENDERER = {
      templates: Object.fromEntries(['studio', 'neon', 'editorial', 'bold', 'noir', 'bloom', 'accent', 'minimal'].map(key => [key, { label: key }])),
      render: (canvas, settings) => renders.push({ canvas, settings })
    };
    w.Image = class { set src(value) { this.value = value; setTimeout(() => this.onload?.(), 0); } get src() { return this.value; } };
    w.eval(source('marketing.js')); await tick();
    const studio = w.document.querySelector('.preview-studio'), canvas = w.document.querySelector('#hero-card');
    for (const key of ['studio', 'noir', 'bold', 'neon']) {
      const button = studio.querySelector(`[data-hero-style="${key}"]`);
      button.click(); await tick();
      assert.equal(canvas.dataset.template, key);
      assert.equal(studio.querySelectorAll('[aria-pressed="true"]').length, 1);
      assert.equal(button.getAttribute('aria-pressed'), 'true');
      assert.equal(w.document.querySelector('#hero-style-status').textContent, `Шаблон ${key}`);
      assert.equal(renders.findLast(render => render.canvas === canvas).settings.template, key);
      const link = new URL(studio.querySelector('[data-hero-open]').href);
      assert.equal(link.searchParams.get('style'), key);
      assert.equal(link.searchParams.get('photo'), 'headphones');
    }
    const comparison = w.document.querySelector('[data-compare-range]');
    comparison.value = '75'; comparison.dispatchEvent(new w.Event('input'));
    assert.equal(comparison.closest('[data-comparison]').style.getPropertyValue('--compare'), '75%');
    assert.equal(comparison.getAttribute('aria-valuetext'), 'Исходное фото: 75%');
  } finally { dom.window.close(); }
});
