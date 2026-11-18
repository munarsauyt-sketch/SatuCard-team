'use strict';

// The comparison, PNG and studio handoffs share one committed render snapshot.
(() => {
  const $ = id => document.getElementById(id);
  const art = document.querySelector('.cover-art');
  const renderer = window.SATUCARD_RENDERER, samples = window.SATUCARD_SAMPLES;
  const project = window.SATUCARD_PROJECT;
  if (!art || !renderer || !samples || !project) return;
  const frame = art.closest('.cover-frame'), photo = $('cover-photo'), card = $('cover-card');
  const range = $('cover-compare'), status = $('cover-status'), open = $('cover-open');
  const png = $('cover-png'), video = $('cover-video'), motion = frame.querySelector('.showcase-motion');
  const products = [...document.querySelectorAll('[data-cover-product]')];
  const modes = [...frame.querySelectorAll('[data-cover-mode]')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const prices = new Intl.NumberFormat('ru-RU');
  let current = null, version = 0, loading = false, action = false, transitionTimer;

  function message(text = '', error = false) {
    status.classList.toggle('sr-only', !error);
    status.textContent = text;
  }
  function updateBusy() {
    art.setAttribute('aria-busy', String(loading));
    range.disabled = loading || !current;
    png.disabled = video.disabled = open.disabled = loading || action || !current;
    products.forEach(button => { button.disabled = action; });
    frame.querySelector('.showcase-exports').setAttribute('aria-busy', String(action));
  }
  function compare(value, animate = false) {
    const split = Math.max(0, Math.min(100, Number(value)));
    clearTimeout(transitionTimer);
    art.classList.toggle('is-transitioning', animate && !reduce.matches);
    if (animate) transitionTimer = setTimeout(() => art.classList.remove('is-transitioning'), 360);
    range.value = String(split);
    art.style.setProperty('--split', split + '%');
    art.dataset.mode = split === 0 ? 'card' : split === 100 ? 'photo' : 'compare';
    modes.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.coverMode === art.dataset.mode)));
  }
  async function display(button) {
    const request = ++version, key = button.dataset.coverProduct;
    const img = new Image();
    img.src = 'assets/images/' + key + '.jpg';
    loading = true; updateBusy(); message('Загружаем пример…');
    try {
      await Promise.all([img.decode(), document.fonts.load('600 32px "Golos Text"')]);
      if (request !== version) return;
      const state = renderer.normalize({
        ...samples[key], template: button.dataset.style, format: 'portrait', font: 'golos',
        ...(key === 'ceramics' ? {
          price: 4500, oldPrice: 5900, badge: 'Хит Kaspi • 0-0-12',
          customColors: true, background: '#eee4d5', accent: '#a85032', textColor: '#30241c'
        } : {})
      });
      // Render offscreen first so an error cannot erase the last usable preview.
      const buffer = document.createElement('canvas');
      renderer.render(buffer, state, { photo: img }, { scale: .8 });
      card.width = buffer.width; card.height = buffer.height;
      card.getContext('2d').drawImage(buffer, 0, 0);
      photo.src = img.src; photo.alt = state.title;
      current = { key, state, img, draftId: null };
      art.dataset.product = key;
      $('cover-name').textContent = state.title;
      $('cover-price').textContent = prices.format(state.price) + ' ₸';
      $('cover-old-price').textContent = state.oldPrice === null ? '' : prices.format(state.oldPrice) + ' ₸';
      $('cover-old-price').hidden = state.oldPrice === null;
      frame.querySelector('.exposure').textContent = String(products.indexOf(button) + 1).padStart(2, '0') + ' / 03';
      products.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      card.hidden = false;
      frame.querySelectorAll('.cover-comparison,.cover-switch,.showcase-exports,.compare-help').forEach(item => { item.hidden = false; });
      open.hidden = false;
      compare(range.value);
      message('Пример готов. Сравните фото и карточку.');
    } catch (_) {
      if (request === version) message('Пример не загрузился. Попробуйте ещё раз.', true);
    } finally {
      if (request === version) { loading = false; updateBusy(); }
    }
  }

  async function draft(snapshot) {
    if (snapshot.draftId) return snapshot.draftId;
    const response = await fetch(snapshot.img.src);
    if (!response.ok) throw new Error('Image unavailable');
    const blob = await response.blob();
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const id = crypto.randomUUID();
    await project.draftAction('put', project.serializeProject(snapshot.state, source, null), id);
    snapshot.draftId = id;
    return id;
  }
  async function run(task, failure) {
    if (loading || action || !current) return;
    const snapshot = current;
    action = true; updateBusy();
    try { await task(snapshot); }
    catch (_) { message(failure, true); }
    finally { action = false; updateBusy(); }
  }
  async function sendTo(destination) {
    await run(async snapshot => {
      message('Сохраняем пример…');
      const id = await draft(snapshot);
      const target = new URL(destination + '.html', location.href);
      target.searchParams.set(destination === 'video' ? 'fromCard' : 'draft', id);
      target.searchParams.set('theme', document.documentElement.dataset.theme || 'dark');
      location.assign(target.href);
    }, 'Не удалось сохранить пример. Проверьте локальное хранилище и повторите.');
  }
  png.addEventListener('click', () => run(async snapshot => {
    message('Готовим PNG…');
    const output = document.createElement('canvas');
    renderer.render(output, snapshot.state, { photo: snapshot.img }, { scale: 1 });
    const blob = await new Promise((resolve, reject) => output.toBlob(value => value ? resolve(value) : reject(new Error('PNG unavailable')), 'image/png'));
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'SatuCard-' + snapshot.key + '-900x1125.png';
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    message('PNG готов. Файл передан браузеру для скачивания.');
  }, 'Не удалось создать PNG. Попробуйте ещё раз.'));
  video.addEventListener('click', () => sendTo('video'));
  open.addEventListener('click', () => sendTo('editor'));
  products.forEach(button => button.addEventListener('click', () => display(button)));
  modes.forEach(button => button.addEventListener('click', () => compare(button.dataset.coverMode === 'card' ? 0 : 100, true)));
  range.addEventListener('input', () => compare(range.value));
  motion.addEventListener('click', () => {
    const paused = frame.classList.toggle('motion-paused');
    motion.setAttribute('aria-pressed', String(paused));
  });
  reduce.addEventListener('change', () => { if (reduce.matches) art.classList.remove('is-transitioning'); });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => frame.classList.toggle('out-of-view', !entry.isIntersecting));
    observer.observe(frame);
  }
  window.addEventListener('pageshow', event => {
    if (event.persisted) { action = false; updateBusy(); message(); }
  });
  document.querySelector('.cover-picker').hidden = false;
  frame.classList.add('is-interactive');
  motion.hidden = false;
  display(products[0]);
})();
