'use strict';

// The exhibition uses the same photo, settings and renderer as the editor link.
(() => {
  const art = document.querySelector('.cover-art');
  const renderer = window.SATUCARD_RENDERER, samples = window.SATUCARD_SAMPLES;
  if (!art || !renderer || !samples) return;
  const photo = document.getElementById('cover-photo'), card = document.getElementById('cover-card');
  const link = document.getElementById('cover-open'), status = document.getElementById('cover-status');
  const products = [...document.querySelectorAll('[data-cover-product]')];
  const modes = [...art.querySelectorAll('[data-cover-mode]')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const prices = new Intl.NumberFormat('ru-RU');
  let selected = products[0], mode = 'photo', version = 0, animation;

  async function display(button, nextMode) {
    const request = ++version, key = button.dataset.coverProduct, sample = samples[key];
    // Keep the last complete image visible until the latest choice is decoded.
    selected = button; mode = nextMode;
    const img = new Image();
    img.src = 'assets/images/' + key + '.jpg';
    art.setAttribute('aria-busy', 'true');
    try {
      await img.decode();
      if (request !== version) return;
      if (nextMode === 'card') {
        renderer.render(card, { ...sample, template: button.dataset.style, format: 'portrait' }, { photo:img }, { scale:.8 });
      }
      photo.src = img.src; photo.alt = sample.title;
      photo.hidden = nextMode !== 'photo'; card.hidden = !photo.hidden;
      art.dataset.product = key; art.dataset.mode = nextMode;
      document.getElementById('cover-name').textContent = sample.title;
      document.getElementById('cover-price').textContent = prices.format(sample.price) + ' ₸';
      document.querySelector('.exposure').textContent = String(products.indexOf(button)+1).padStart(2,'0') + ' / 03';
      link.href = 'editor.html?' + new URLSearchParams({photo:key, style:button.dataset.style, theme:document.documentElement.dataset.theme || 'light'});
      products.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      modes.forEach(item => item.setAttribute('aria-pressed', String(item.dataset.coverMode === nextMode)));
      status.classList.add('sr-only');
      status.textContent = sample.title + ' · ' + modes.find(item => item.dataset.coverMode === nextMode).textContent;
      animation?.cancel();
      if (!reduce.matches) animation = (photo.hidden ? card : photo).animate([{opacity:.65, transform:'scale(1.025)'},{opacity:1, transform:'scale(1)'}], {duration:320,easing:'ease-out'});
    } catch {
      if (request !== version) return;
      selected = products.find(item => item.getAttribute('aria-pressed') === 'true');
      mode = modes.find(item => item.getAttribute('aria-pressed') === 'true').dataset.coverMode;
      status.classList.remove('sr-only');
      status.textContent = 'Пример не загрузился. Попробуйте ещё раз.';
    } finally {
      if (request === version) art.setAttribute('aria-busy','false');
    }
  }
  products.forEach(button => button.addEventListener('click', () => display(button, mode)));
  modes.forEach(button => button.addEventListener('click', () => display(selected, button.dataset.coverMode)));
  document.querySelector('.cover-picker').hidden = false;
  document.querySelector('.cover-switch').hidden = false;
})();
