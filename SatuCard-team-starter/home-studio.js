'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const form = $('home-studio'), renderer = window.SATUCARD_RENDERER;
  const project = window.SATUCARD_PROJECT, importer = window.SATUCARD_PHOTO_IMPORT;
  const sample = window.SATUCARD_SAMPLES?.ceramics;
  if (!form || !renderer || !project || !importer || !sample) return;

  const demoUrl = 'assets/images/ceramics.jpg';
  const file = $('quick-file'), upload = $('quick-upload'), example = $('quick-example');
  const title = $('quick-title'), price = $('quick-price'), canvas = $('hero-card');
  const thumbnail = $('quick-photo'), open = $('quick-open'), drop = $('quick-drop'), result = $('quick-result');
  const download = $('quick-png');
  const styles = [...form.querySelectorAll('[data-hero-style]')];
  let template = 'studio', image = null, source = null, isExample = true;
  let busy = false, frame = 0;
  const quickId = 'home-quick', journalKey = 'satucard-quick-journal';
  let saveTimer, saveQueue = Promise.resolve(), photoKey = 'demo', restoring = true;
  const backup = document.createElement('button');
  backup.type = 'button'; backup.className = 'button secondary'; backup.hidden = true;
  backup.textContent = 'Скачать файл проекта'; open.after(backup);

  function draftMetadata() { return { title: title.value, price: price.value, template, isExample, photoKey }; }
  function draftPayload() {
    return JSON.stringify({ ...JSON.parse(project.serializeProject(settings(), source, null)), quickDraft: draftMetadata() });
  }
  function saveQuick() {
    clearTimeout(saveTimer);
    if (restoring || !image) return saveQueue;
    const payload = draftPayload();
    saveQueue = saveQueue.catch(() => {}).then(() => project.draftAction('put', payload, quickId)).catch(() => {
      backup.hidden = false;
      setStatus('Автосохранение недоступно. Скачайте файл проекта, чтобы не потерять работу.', true);
    });
    return saveQueue;
  }
  function edited() {
    if (restoring) return;
    try { localStorage.setItem(journalKey, JSON.stringify(draftMetadata())); } catch (_) {}
    clearTimeout(saveTimer); saveTimer = setTimeout(saveQuick, 250);
  }
  backup.addEventListener('click', async () => {
    try {
      let photo = source;
      if (isExample) {
        const response = await fetch(demoUrl);
        if (!response.ok) throw new Error();
        photo = await readSource(await response.blob());
      }
      const url = URL.createObjectURL(new Blob([project.serializeProject(settings(), photo, null)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'SatuCard.satu.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (_) { setStatus('Не удалось скачать проект. Повторите попытку.', true); }
  });

  const readSource = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  async function decode(url) {
    const photo = new Image();
    photo.src = url;
    await photo.decode();
    if (!photo.naturalWidth || !photo.naturalHeight) throw new Error('Empty image');
    return photo;
  }

  function setStatus(message = '', error = false) {
    const status = $('quick-status');
    status.textContent = message;
    status.classList.toggle('is-error', error);
  }

  function setBusy(value) {
    busy = value;
    result.setAttribute('aria-busy', String(value));
    upload.disabled = example.disabled = file.disabled = value;
    title.disabled = price.disabled = value;
    styles.forEach(button => { button.disabled = value; });
    open.disabled = download.disabled = value || !image;
  }

  function priceValue() {
    const value = price.value.replace(/[ \u00a0\u202f]/g, '').replace(',', '.');
    if (value === '') return null;
    const amount = Number(value);
    return /^\d+(?:\.\d{1,2})?$/.test(value) && amount <= 999999999.99 ? amount : NaN;
  }

  function settings() {
    const amount = priceValue();
    return renderer.normalize({
      ...(isExample ? sample : {}),
      title: title.value,
      price: Number.isFinite(amount) ? amount : null,
      template,
      showBrand: false,
      format: 'portrait'
    });
  }

  function paint() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      renderer.render(canvas, settings(), { photo: image }, { scale: .65 });
      canvas.classList.add('rendered');
    });
  }

  function showPhoto(photo, data, demo) {
    image = photo;
    source = data;
    isExample = demo;
    thumbnail.src = photo.src;
    $('quick-upload-label').textContent = demo ? 'Загрузить фото' : 'Заменить фото';
    open.disabled = busy;
    paint();
  }

  async function loadExample() {
    if (busy) return;
    setBusy(true);
    setStatus('Загружаем пример…');
    try {
      const photo = await decode(demoUrl);
      title.value = sample.title;
      price.value = String(sample.price);
      price.removeAttribute('aria-invalid');
      showPhoto(photo, null, true);
      photoKey = 'demo'; edited();
      await saveQuick();
      if (backup.hidden) setStatus('Демонстрационная карточка');
    } catch (_) {
      setStatus('Пример не загрузился. Выберите своё фото.', true);
    } finally {
      setBusy(false);
    }
  }

  async function addPhoto(selected) {
    if (!selected || busy) return;
    if (!importer.accepts(selected) || selected.size > 10 * 1024 * 1024) {
      setStatus('Выберите JPG, PNG, WebP или HEIC до 10 МБ.', true);
      return;
    }
    setBusy(true);
    setStatus('Читаем фото…');
    try {
      const blob = await importer.convert(selected);
      const url = URL.createObjectURL(blob);
      let data;
      try {
        const photo = await decode(url);
        if (photo.naturalWidth * photo.naturalHeight > 60_000_000) {
          setStatus('Уменьшите изображение до 60 мегапикселей.', true);
          return;
        }
        const ratio = Math.min(1, 1800 / Math.max(photo.naturalWidth, photo.naturalHeight));
        const surface = document.createElement('canvas');
        surface.width = Math.max(1, Math.round(photo.naturalWidth * ratio));
        surface.height = Math.max(1, Math.round(photo.naturalHeight * ratio));
        surface.getContext('2d').drawImage(photo, 0, 0, surface.width, surface.height);
        data = surface.toDataURL(blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp', .92);
      } finally {
        URL.revokeObjectURL(url);
      }
      const photo = await decode(data);
      if (isExample) {
        title.value = '';
        price.value = '';
        price.removeAttribute('aria-invalid');
      }
      showPhoto(photo, data, false);
      photoKey = crypto.randomUUID(); edited();
      await saveQuick();
      if (backup.hidden) setStatus('Фото загружено. Добавьте данные товара.');
      title.focus({ preventScroll: true });
    } catch (_) {
      setStatus('Не удалось прочитать фото. Попробуйте другой файл.', true);
    } finally {
      setBusy(false);
    }
  }

  upload.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const selected = file.files[0];
    file.value = '';
    addPhoto(selected);
  });
  example.addEventListener('click', loadExample);
  drop.addEventListener('dragover', event => {
    event.preventDefault();
    if (!busy) drop.classList.add('is-dragging');
  });
  drop.addEventListener('dragleave', event => {
    if (!drop.contains(event.relatedTarget)) drop.classList.remove('is-dragging');
  });
  drop.addEventListener('drop', event => {
    event.preventDefault();
    drop.classList.remove('is-dragging');
    addPhoto(event.dataTransfer?.files[0]);
  });
  title.addEventListener('input', () => { paint(); edited(); });
  price.addEventListener('input', () => {
    const invalid = Number.isNaN(priceValue());
    const wasInvalid = price.getAttribute('aria-invalid') === 'true';
    price.setAttribute('aria-invalid', String(invalid));
    if (invalid && !wasInvalid) setStatus('Укажите цену числом до 999 999 999,99 ₸.', true);
    if (!invalid && wasInvalid) setStatus();
    paint();
    edited();
  });
  styles.forEach(button => button.addEventListener('click', () => {
    template = button.dataset.heroStyle;
    styles.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    paint();
    edited();
  }));

  function readyToExport() {
    if (busy || !image) return false;
    if (Number.isNaN(priceValue())) {
      setStatus('Укажите цену числом до 999 999 999,99 ₸.', true);
      price.focus();
      return false;
    }
    return true;
  }
  download.addEventListener('click', async () => {
    if (!readyToExport()) return;
    setBusy(true);
    setStatus('Готовим PNG…');
    try {
      await window.downloadHomeCard(settings(), image, title.value.trim() || 'SatuCard');
      setStatus('PNG готов. Файл передан браузеру для скачивания.');
    } catch (_) {
      setStatus('Не удалось создать PNG. Попробуйте ещё раз.', true);
    } finally { setBusy(false); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!readyToExport()) return;
    const state = settings();
    setBusy(true);
    setStatus('Открываем в редакторе…');
    try {
      let data = source;
      if (isExample) {
        const response = await fetch(demoUrl);
        if (!response.ok) throw new Error('Example unavailable');
        data = await readSource(await response.blob());
      }
      const id = crypto.randomUUID();
      const payload = project.serializeProject(state, data, null);
      await project.draftAction('put', payload, id);
      const target = new URL('editor.html', location.href);
      target.searchParams.set('draft', id);
      target.searchParams.set('style', state.template);
      target.searchParams.set('theme', document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
      location.assign(target.href);
    } catch (_) {
      backup.hidden = false;
      setStatus('Черновик не сохранился. Разрешите локальное хранилище и повторите.', true);
      setBusy(false);
    }
  });

  window.addEventListener('pageshow', event => {
    if (event.persisted && busy) {
      setBusy(false);
      setStatus(isExample ? 'Демонстрационная карточка' : 'Фото загружено. Добавьте данные товара.');
    }
  });
  form.hidden = false;
  $('quick-fallback').hidden = true;
  window.addEventListener('pagehide', saveQuick);
  async function restoreQuick() {
    setBusy(true);
    try {
      const raw = await project.draftAction('get', undefined, quickId);
      if (!raw) { await loadInitialExample(); return; }
      const data = project.parseProject(raw, renderer.normalize);
      let metadata = JSON.parse(raw).quickDraft;
      if (!metadata || typeof metadata.title !== 'string' || typeof metadata.price !== 'string') throw new Error();
      try {
        const journal = JSON.parse(localStorage.getItem(journalKey));
        if (journal?.photoKey === metadata.photoKey && typeof journal.title === 'string' && typeof journal.price === 'string') metadata = journal;
      } catch (_) {}
      template = styles.some(button => button.dataset.heroStyle === metadata.template) ? metadata.template : 'studio';
      title.value = metadata.title.slice(0, 200); price.value = metadata.price.slice(0, 60);
      photoKey = metadata.photoKey; styles.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.heroStyle === template)));
      showPhoto(await decode(data.photo || demoUrl), data.photo || null, metadata.isExample === true);
      setStatus('Черновик восстановлен на этом устройстве.');
    } catch (error) {
      await loadInitialExample();
      setStatus('Не удалось восстановить черновик: ' + (error.message || 'проверьте хранилище браузера.'), true);
    }
    finally { restoring = false; setBusy(false); }
  }
  async function loadInitialExample() { setBusy(false); await loadExample(); }
  restoreQuick();
  document.fonts?.ready.then(paint);
})();
