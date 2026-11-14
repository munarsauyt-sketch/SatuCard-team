import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const source = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('home offers quick editing, an editor fallback and actionable category examples', () => {
  const dom = new JSDOM(source('index.html'), { url: 'https://satucard.test/' });
  try {
    const hero = dom.window.document.querySelector('.mark-hero');
    assert.equal(hero.querySelectorAll('h1').length, 1);
    const studio = hero.querySelector('#home-studio');
    assert.ok(studio.hidden);
    assert.equal(studio.querySelector('#quick-file').type, 'file');
    assert.equal(studio.querySelectorAll('[data-hero-style]').length, 4);
    assert.equal(studio.querySelector('#quick-open').type, 'submit');
    assert.equal(hero.querySelector('#quick-fallback a').getAttribute('href'), 'editor.html');
    const examples = dom.window.document.querySelectorAll('.preview-example');
    assert.equal(examples.length, 5);
    for (const link of examples) {
      const url = new URL(link.href);
      const canvas = link.querySelector('canvas');
      assert.equal(url.pathname, '/editor.html');
      assert.equal(url.searchParams.get('style'), canvas.dataset.template);
      assert.equal(url.searchParams.get('photo'), canvas.dataset.photo);
    }
    const help = dom.window.document.getElementById('how-it-works');
    assert.equal(help.querySelector('.intro-guide-link').getAttribute('href'), 'guide.html');
    const video = help.querySelector('video');
    assert.ok(video.hasAttribute('controls'));
    assert.ok(video.hasAttribute('playsinline'));
    assert.ok(!video.hasAttribute('autoplay'));
    assert.equal(video.querySelector('track').getAttribute('kind'), 'captions');
  } finally { dom.window.close(); }
});
