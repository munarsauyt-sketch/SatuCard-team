'use strict';

(() => {
  const renderer = window.SATUCARD_RENDERER;
  if (!renderer) return;
  const samples = window.SATUCARD_SAMPLES;
  const images = new Map();
  const cards = [...document.querySelectorAll('[data-mark-card]')];
  const galleryCards = cards.filter(canvas => canvas.closest('[data-template-item]'));
  const originalSamples = new Map(galleryCards.map(canvas => [canvas, canvas.dataset.photo]));
  const productSelector = document.querySelector('[data-demo-product]');
  const prices = new Intl.NumberFormat('ru-RU');
  let gallerySample = 'mixed';
  function loadImage(key) {
    if (images.has(key)) return images.get(key);
    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image); image.onerror = reject;
      image.src = window.SATUCARD_DEMO_IMAGES?.[key] || `assets/images/${key}.jpg`;
    });
    images.set(key, promise); return promise;
  }
  async function renderCard(canvas) {
    const key = canvas.dataset.photo || 'headphones';
    try {
      const image = await loadImage(key);
      if (canvas.dataset.photo !== key) return;
      const sample = samples[key];
      renderer.render(canvas, { ...sample, title: sample.headline, subtitle: sample.title, template: canvas.dataset.template, format: 'portrait', brandName: 'YOUR STORE', photo: { fit: 'cover', radius: 24, ...sample.photo } }, { photo: image }, { scale: canvas.id === 'hero-card' ? .65 : .48 });
      canvas.classList.add('rendered');
    } catch (_) {
      // Keep the real photo visible if local canvas or image rendering is unavailable.
    }
  }
  function updateGalleryCard(canvas) {
    const key = canvas.dataset.photo, sample = samples[key];
    const link = canvas.closest('[data-editor-template]'), article = canvas.closest('[data-template-item]');
    const fallback = link.querySelector('.canvas-fallback');
    fallback.src = `assets/images/${key}.jpg`; fallback.alt = sample.title;
    article.querySelector('[data-product-label]').textContent = `${sample.title} · ${prices.format(sample.price)} ₸`;
    link.setAttribute('aria-label', `${sample.title}. Открыть шаблон ${renderer.templates[link.dataset.editorTemplate].label} в редакторе`);
    const url = new URL(link.href, location.href);
    url.searchParams.set('photo', key); url.searchParams.set('style', link.dataset.editorTemplate);
    url.searchParams.set('theme', document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    link.href = url.href;
    canvas.classList.remove('rendered');
    renderCard(canvas);
  }
  function updateCatalogStatus() {
    const status = document.getElementById('catalog-status'); if (!status) return;
    const visible = document.querySelectorAll('[data-template-item]:not([hidden])').length;
    status.textContent = `Шаблонов: ${visible} из ${galleryCards.length}. ${gallerySample === 'mixed' ? 'Разные товары' : 'Один товар: ' + samples[gallerySample].label}.`;
  }
  function updateGallery() {
    gallerySample = samples[productSelector?.value] ? productSelector.value : 'mixed';
    if (productSelector) productSelector.value = gallerySample;
    galleryCards.forEach(canvas => {
      canvas.dataset.photo = gallerySample === 'mixed' ? originalSamples.get(canvas) : gallerySample;
      updateGalleryCard(canvas);
    });
    updateCatalogStatus();
  }
  document.querySelectorAll('[data-hero-style]').forEach(button => {
    button.addEventListener('click', () => {
      const canvas = document.getElementById('hero-card'); if (!canvas) return;
      canvas.dataset.template = button.dataset.heroStyle;
      document.querySelectorAll('[data-hero-style]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      document.getElementById('hero-style-status').textContent = 'Шаблон ' + renderer.templates[button.dataset.heroStyle].label;
      canvas.setAttribute('aria-label', samples[canvas.dataset.photo].title + ' в шаблоне ' + renderer.templates[button.dataset.heroStyle].label);
      renderCard(canvas);
      const wrap = canvas.closest('.hero-primary'); wrap.classList.remove('is-swapping');
      requestAnimationFrame(() => wrap.classList.add('is-swapping'));
    });
  });
  document.querySelectorAll('[data-compare-range]').forEach(input => {
    input.addEventListener('input', () => input.closest('[data-comparison]').style.setProperty('--compare', `${input.value}%`));
  });
  document.querySelectorAll('[data-template-filter]').forEach(button => {
    button.addEventListener('click', () => {
      const filter = button.dataset.templateFilter;
      document.querySelectorAll('[data-template-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      document.querySelectorAll('[data-template-item]').forEach(item => {
        const visible = filter === 'all' || item.dataset.category.split(' ').includes(filter);
        item.hidden = !visible;
      });
      updateCatalogStatus();
    });
  });
  productSelector?.addEventListener('change', updateGallery);
  // Browsers may restore a select after Back; keep the links and previews in sync.
  window.addEventListener('pageshow', updateGallery);
  document.querySelectorAll('[data-editor-template]').forEach(link => link.addEventListener('click', () => {
    const url = new URL(link.href, location.href);
    url.searchParams.set('theme', document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'); link.href = url.href;
  }));
  Promise.resolve(document.fonts?.ready).then(() => {
    updateGallery();
    cards.filter(canvas => !originalSamples.has(canvas)).forEach(renderCard);
  });
})();
