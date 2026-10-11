'use strict';

(() => {
  const renderer = window.SATUCARD_RENDERER;
  if (!renderer) return;
  const samples = {
    headphones: { title: 'Звук без границ', subtitle: 'Беспроводные наушники', price: 24990, features: ['Ваш ежедневный ритм', 'Комфортная посадка', 'Без лишних проводов'], badge: 'Ваш следующий выбор' },
    sneaker: { title: 'Лёгкость в каждом шаге', subtitle: 'Кроссовки Daily', price: 32500, features: ['На каждый день', 'Ваш городской стиль', 'Выберите свой размер'], badge: 'Новая коллекция' },
    skincare: { title: 'Время для себя', subtitle: 'Сыворотка для лица', price: 8900, features: ['Ваш ритуал ухода', 'Удобный флакон', 'Забота в деталях'], badge: 'Маленький ритуал' }
  };
  const images = new Map();
  const cards = [...document.querySelectorAll('[data-mark-card]')];
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
      renderer.render(canvas, { ...samples[key], template: canvas.dataset.template, format: 'portrait', brandName: 'YOUR STORE', photo: { fit: 'cover', radius: 24 } }, { photo: image }, { scale: canvas.id === 'hero-card' ? .65 : .48 });
      canvas.classList.add('rendered');
    } catch (_) {
      // Keep the real photo visible if local canvas or image rendering is unavailable.
    }
  }
  function updateEditorLinks() {
    document.querySelectorAll('[data-editor-template]').forEach(link => {
      const url = new URL(link.href, location.href);
      url.searchParams.set('photo', gallerySample); url.searchParams.set('style', link.dataset.editorTemplate);
      url.searchParams.set('theme', document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
      link.href = url.href;
    });
  }
  document.querySelectorAll('[data-hero-style]').forEach(button => {
    button.addEventListener('click', () => {
      const canvas = document.getElementById('hero-card'); if (!canvas) return;
      canvas.dataset.template = button.dataset.heroStyle;
      document.querySelectorAll('[data-hero-style]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      document.getElementById('hero-style-status').textContent = 'Шаблон ' + renderer.templates[button.dataset.heroStyle].label;
      canvas.setAttribute('aria-label', 'Наушники в шаблоне ' + renderer.templates[button.dataset.heroStyle].label);
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
      let count = 0;
      document.querySelectorAll('[data-template-item]').forEach(item => {
        const visible = filter === 'all' || item.dataset.category.split(' ').includes(filter);
        item.hidden = !visible; if (visible) count++;
      });
      document.getElementById('catalog-status').textContent = filter === 'all' ? 'Показаны все 8 шаблонов' : `Показано шаблонов: ${count}`;
    });
  });
  document.querySelector('[data-demo-product]')?.addEventListener('change', event => {
    if (!samples[event.target.value]) return; gallerySample = event.target.value;
    cards.forEach(canvas => {
      canvas.dataset.photo = gallerySample;
      const fallback = canvas.parentElement.querySelector('.canvas-fallback');
      if (fallback) { fallback.src = `assets/images/${gallerySample}.jpg`; fallback.alt = samples[gallerySample].subtitle; }
      renderCard(canvas);
    });
    updateEditorLinks();
  });
  Promise.resolve(document.fonts?.ready).then(() => cards.forEach(renderCard));
})();
