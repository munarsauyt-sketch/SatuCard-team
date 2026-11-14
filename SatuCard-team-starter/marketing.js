'use strict';

(() => {
  const renderer = window.SATUCARD_RENDERER;
  if (!renderer) return;
  const samples = window.SATUCARD_SAMPLES;
  const images = new Map();
  const cards = [...document.querySelectorAll('[data-mark-card]')];
  const galleryRoot = document.querySelector('.gallery-grid') || document.querySelector('[data-template-item]')?.parentElement;
  if (galleryRoot) {
    const existing = new Set([...document.querySelectorAll('[data-template-item]')].map(item => item.dataset.templateItem));
    for (const [key, template] of Object.entries(renderer.templates)) {
      if (existing.has(key)) continue;
      const article = document.querySelector('[data-template-item]').cloneNode(true);
      article.dataset.templateItem = key;
      article.dataset.category = ['blueprint', 'graphite'].includes(key) ? 'dark' : key === 'pop' ? 'expressive' : 'light';
      article.querySelector('h2').textContent = template.label;
      const link = article.querySelector('[data-editor-template]');
      link.dataset.editorTemplate = key;
      const canvas = article.querySelector('canvas');
      canvas.dataset.template = key; canvas.dataset.photo = 'headphones';
      galleryRoot.append(article);
      cards.push(canvas);
    }
    const all = document.querySelector('[data-template-filter="all"]');
    if (all) all.textContent = 'Все ' + Object.keys(renderer.templates).length;
  }
  const galleryCards = cards.filter(canvas => canvas.closest('[data-template-item]'));
  const originalSamples = new Map(galleryCards.map(canvas => [canvas, canvas.dataset.photo]));
  const productSelector = document.querySelector('[data-demo-product]');
  const prices = new Intl.NumberFormat('ru-RU');
  let gallerySample = 'headphones';
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
      renderer.render(canvas, { ...sample, title: sample.headline, subtitle: sample.title, description: '', template: canvas.dataset.template, format: 'portrait', brandName: 'YOUR STORE', photo: { fit: 'cover', radius: 24, ...sample.photo } }, { photo: image }, { scale: canvas.id === 'hero-card' ? .65 : .48 });
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
    const empty = document.getElementById('catalog-empty');
    if (empty) empty.hidden = visible !== 0;
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
  const heroLink = document.querySelector('[data-hero-open]');
  const heroStyles = document.querySelectorAll('[data-hero-style]');
  heroStyles.forEach(button => {
    button.addEventListener('click', () => {
      const canvas = document.getElementById('hero-card'); if (!canvas) return;
      const style = button.dataset.heroStyle;
      canvas.dataset.template = style;
      heroStyles.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      document.getElementById('hero-style-status').textContent = 'Шаблон ' + renderer.templates[style].label;
      canvas.setAttribute('aria-label', samples[canvas.dataset.photo].title + ' в шаблоне ' + renderer.templates[style].label);
      renderCard(canvas);
      if (heroLink) {
        heroLink.closest('[data-comparison]').dataset.style = style;
        const url = new URL(heroLink.href, location.href);
        url.searchParams.set('style', style);
        heroLink.href = url.href;
      }
      const wrap = canvas.closest('.hero-primary'); wrap.classList.remove('is-swapping');
      requestAnimationFrame(() => wrap.classList.add('is-swapping'));
    });
  });
  document.querySelectorAll('[data-compare-range]').forEach(input => {
    const updateComparison = () => {
      input.closest('[data-comparison]').style.setProperty('--compare', `${input.value}%`);
      input.setAttribute('aria-valuetext', `Исходное фото: ${input.value}%`);
    };
    input.addEventListener('input', updateComparison);
    updateComparison();
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
