'use strict';

// Editing stays on this device. Publication sends only the finished card.
(() => {
  const $ = id => document.getElementById(id);
  const form = $('editor-form'), renderer = window.SATUCARD_RENDERER, project = window.SATUCARD_PROJECT;
  if (!form || !renderer || !project) return;
  form.inert = true;
  ['download-button', 'publish-button', 'save-project-button', 'load-project-input'].forEach(id => { $(id).disabled = true; });
  const canvas = $('product-canvas'), assets = new Map();
  const palettes = {
    forest: ['#e1e8d9', '#466343', '#233126'], orange: ['#fff0e5', '#f06435', '#35251f'],
    ocean: ['#dcedf5', '#087da1', '#112c3d'], violet: ['#ece5ff', '#8053df', '#2a2041'], rose: ['#fce5ed', '#c34f7a', '#462232']
  };
  const samples = {
    headphones: { title: 'Беспроводные наушники', price: 24990, subtitle: 'Музыка в вашем ритме', description: 'Добавьте точные характеристики вашего товара.', features: ['Беспроводное подключение', 'Мягкие амбушюры', 'Современный дизайн'] },
    sneaker: { title: 'Кроссовки Daily', price: 32500, subtitle: 'Ваш повседневный стиль', description: 'Укажите доступные размеры и материалы.', features: ['Для повседневных образов', 'Лаконичный силуэт', 'Выберите свой размер'] },
    skincare: { title: 'Сыворотка для лица', price: 8900, subtitle: 'Время для себя', description: 'Добавьте состав, объём и способ применения.', features: ['Ежедневный уход', 'Удобный флакон', 'Подробнее о составе'] }
  };
  const textFields = { 'product-name': 'title', 'product-subtitle': 'subtitle', 'product-description': 'description', 'product-badge': 'badge', 'brand-name': 'brandName' };
  const selectFields = { 'card-format': 'format', 'font-family': 'font', 'text-align': 'textAlign' };
  const colorFields = { 'background-color': 'background', 'accent-color': 'accent', 'text-color': 'textColor' };
  const checkFields = { 'show-price': 'showPrice', 'show-brand': 'showBrand', 'custom-colors': 'customColors' };
  const photoRanges = { 'photo-zoom': 'zoom', 'photo-position-x': 'x', 'photo-position-y': 'y', 'photo-rotation': 'rotation', 'photo-brightness': 'brightness', 'photo-contrast': 'contrast', 'photo-saturation': 'saturation', 'photo-radius': 'radius' };
  let model = { settings: renderer.normalize({ ...samples.headphones, brandName: 'SatuCard.', template: 'neon', format: 'portrait' }), photoId: null, logoId: null };
  let initialModel, history, geometry, dragging, pendingDraft;
  let framePending = false, initialized = false, publishing = false, exporting = false;
  let historyTimer, draftTimer, thumbTimer, lastPublished = '';
  let photoVersion = 0, logoVersion = 0, projectVersion = 0;
  let draftQueue = Promise.resolve();
  const clone = value => JSON.parse(JSON.stringify(value));
  const imageAssets = () => ({ photo: assets.get(model.photoId)?.image || null, logo: assets.get(model.logoId)?.image || null });
  const filename = () => (model.settings.title || 'SatuCard').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').slice(0, 60).trim() || 'SatuCard';
  const status = (id, text, error = false) => { $(id).textContent = text; $(id).classList.toggle('error', error); };

  function readPrice(id, errorId, current) {
    const input = $(id), raw = input.value.replace(/\s/g, '').replace(',', '.');
    const numeric = raw === '' || (/^\d{1,9}(\.\d{0,2})?$/.test(raw) && Number(raw) <= 999999999.99);
    const greater = raw === '' || current == null || Number(raw) > current;
    const valid = numeric && greater;
    input.setAttribute('aria-invalid', String(!valid));
    $(errorId).textContent = !numeric ? 'Введите цену от 0 до 999 999 999,99 ₸.' : !greater ? 'Старая цена должна быть выше текущей.' : '';
    return { valid, value: valid && raw !== '' ? Number(raw) : null };
  }
  function validDetails(requirePrice = false) {
    const price = readPrice('product-price', 'price-error'), old = readPrice('old-price', 'old-price-error', price.value);
    if (!price.valid || !old.valid) { activateTab('content'); status('download-status', 'Исправьте цену товара.', true); return false; }
    if (!$('product-name').value.trim()) { activateTab('content'); $('product-name').focus(); status('download-status', 'Введите название товара.', true); return false; }
    if (requirePrice && price.value === null) { activateTab('content'); $('price-error').textContent = 'Для публикации укажите цену.'; $('product-price').focus(); return false; }
    return true;
  }
  function readForm() {
    const settings = { ...model.settings, photo: { ...model.settings.photo } };
    for (const [id, key] of Object.entries(textFields)) settings[key] = $(id).value;
    for (const [id, key] of Object.entries(selectFields)) settings[key] = $(id).value;
    for (const [id, key] of Object.entries(colorFields)) settings[key] = $(id).value;
    for (const [id, key] of Object.entries(checkFields)) settings[key] = $(id).checked;
    for (const [id, key] of Object.entries(photoRanges)) settings.photo[key] = Number($(id).value) / (key === 'zoom' ? 100 : 1);
    settings.photo.flip = $('photo-flip').checked;
    settings.photo.fit = form.querySelector('[name="photo-fit"]:checked')?.value || 'contain';
    settings.textScale = Number($('text-scale').value);
    settings.features = [1, 2, 3].map(index => $('feature-' + index).value);
    const price = readPrice('product-price', 'price-error');
    settings.price = price.value; settings.oldPrice = readPrice('old-price', 'old-price-error', price.value).value;
    model.settings = renderer.normalize(settings); updateOutputs();
  }
  function syncForm() {
    const settings = model.settings;
    for (const [id, key] of Object.entries({ ...textFields, ...selectFields, ...colorFields })) $(id).value = settings[key];
    for (const [id, key] of Object.entries(checkFields)) $(id).checked = settings[key];
    for (const [id, key] of Object.entries(photoRanges)) $(id).value = settings.photo[key] * (key === 'zoom' ? 100 : 1);
    $('photo-flip').checked = settings.photo.flip;
    form.querySelector('[name="photo-fit"][value="' + settings.photo.fit + '"]').checked = true;
    $('text-scale').value = settings.textScale;
    [1, 2, 3].forEach(index => { $('feature-' + index).value = settings.features[index - 1] || ''; });
    $('product-price').value = settings.price ?? ''; $('old-price').value = settings.oldPrice ?? '';
    readPrice('product-price', 'price-error'); readPrice('old-price', 'old-price-error', settings.price);
    $('brand-logo-remove').disabled = !model.logoId; updateOutputs();
  }
  function updateOutputs() {
    $('name-count').textContent = `${$('product-name').value.length} / 60`;
    for (const [id, key] of Object.entries(photoRanges)) $(id + '-value').value = $(id).value + (key === 'rotation' ? '°' : key === 'radius' ? ' px' : '%');
    $('text-scale-value').value = $('text-scale').value + '%';
    for (const id of Object.keys(colorFields)) $(id).disabled = !$('custom-colors').checked;
  }
  function clearPublished() { $('publish-result').hidden = true; if (!publishing) status('publish-status', ''); }
  function renderNow() {
    framePending = false; geometry = renderer.render(canvas, model.settings, imageAssets());
    const size = renderer.formats[model.settings.format];
    $('format-description').textContent = `${size.label} · ${size.width} × ${size.height}`;
    $('preview-caption').textContent = `Карточка: ${model.settings.title}. Шаблон ${renderer.templates[model.settings.template].label}.`;
    canvas.setAttribute('aria-label', $('preview-caption').textContent);
    $('download-button').querySelector('span').textContent = $('export-format').value === 'jpeg' ? 'Скачать JPEG' : 'Скачать PNG';
    document.querySelectorAll('[data-template]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.template === model.settings.template)));
    document.querySelectorAll('[data-sample]').forEach(button => button.setAttribute('aria-pressed', String(model.photoId === 'sample-' + button.dataset.sample)));
    const filters = { original: [100, 100, 100], mono: [100, 110, 0], vivid: [103, 115, 130], soft: [110, 90, 85] };
    document.querySelectorAll('[data-photo-filter]').forEach(button => button.setAttribute('aria-pressed', String(filters[button.dataset.photoFilter].every((value, index) => value === model.settings.photo[['brightness', 'contrast', 'saturation'][index]]))));
    document.querySelectorAll('[data-palette]').forEach(button => button.setAttribute('aria-pressed', String(model.settings.customColors && palettes[button.dataset.palette].every((value, index) => value === model.settings[['background', 'accent', 'textColor'][index]]))));
    if ($('fullscreen-dialog').open) renderer.render($('fullscreen-canvas'), model.settings, imageAssets());
  }
  function requestRender(thumbs = false) {
    if (!framePending) { framePending = true; requestAnimationFrame(renderNow); }
    if (thumbs) { clearTimeout(thumbTimer); thumbTimer = setTimeout(renderThumbnails, 220); }
  }
  function renderThumbnails() {
    document.querySelectorAll('[data-template]').forEach(button => renderer.render(button.querySelector('canvas'), { ...model.settings, template: button.dataset.template, customColors: false, format: 'portrait' }, imageAssets(), { scale: 0.16 }));
  }
  function buildTemplates() {
    for (const [key, template] of Object.entries(renderer.templates)) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'template-card'; button.dataset.template = key;
      button.setAttribute('aria-label', template.label + '. ' + template.description); button.setAttribute('aria-pressed', 'false');
      const thumb = document.createElement('canvas'); thumb.className = 'template-thumb'; thumb.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span'); label.className = 'template-label'; label.textContent = template.label;
      button.append(thumb, label); $('template-grid').append(button);
    }
  }
  function updateHistory() { $('undo-button').disabled = !history?.canUndo; $('redo-button').disabled = !history?.canRedo; }
  function commit() {
    clearTimeout(historyTimer); historyTimer = null; if (!initialized) return;
    history.push(model); updateHistory();
  }
  function releaseUnusedAssets() {
    if (!history) return;
    const retained = new Set(history.retained().flatMap(entry => [entry.photoId, entry.logoId]));
    if (initialModel) { retained.add(initialModel.photoId); retained.add(initialModel.logoId); }
    for (const key of assets.keys()) if (!key.startsWith('sample-') && !retained.has(key)) assets.delete(key);
  }
  function edited(thumbs = false, immediate = true) {
    if (pendingDraft) { pendingDraft = null; $('draft-restore-banner').hidden = true; }
    clearPublished(); status('download-status', ''); requestRender(thumbs);
    if (immediate) { commit(); releaseUnusedAssets(); } else { clearTimeout(historyTimer); historyTimer = setTimeout(commit, 600); }
    saveDraftSoon();
  }
  function undoRedo(direction) {
    // Flush an in-progress edit before moving the history cursor.
    if (historyTimer) { clearTimeout(historyTimer); historyTimer = null; commit(); }
    ++photoVersion; ++logoVersion; ++projectVersion;
    model = direction === 'undo' ? history.undo() : history.redo();
    syncForm(); updateHistory(); clearPublished(); requestRender(true); fitPreview(); saveDraftSoon();
    status('file-status', model.photoId ? 'Фото из выбранного состояния истории.' : 'Загрузите фото товара.');
    status('brand-logo-status', model.logoId ? 'Логотип из выбранного состояния истории.' : '');
  }
  function serialized() { return project.serializeProject(model.settings, assets.get(model.photoId)?.source || null, assets.get(model.logoId)?.source || null); }
  function saveDraftSoon() {
    if (!initialized) return; clearTimeout(draftTimer); status('draft-status', 'Сохраняем черновик…');
    draftTimer = setTimeout(() => {
      let value;
      try { value = serialized(); } catch (_) { status('draft-status', 'Скачайте проект для сохранения.', true); return; }
      draftQueue = draftQueue.catch(() => {}).then(() => project.draftAction('put', value));
      draftQueue.then(() => status('draft-status', 'Черновик сохранён на этом устройстве'), () => status('draft-status', 'Автосохранение недоступно — скачайте проект', true));
    }, 800);
  }
  function decodeImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => image.naturalWidth && image.naturalHeight ? resolve(image) : reject(new Error('Пустое изображение'));
      image.onerror = () => reject(new Error('Не удалось прочитать изображение. Выберите другой файл.')); image.src = source;
    });
  }
  async function registerAsset(source, id = 'asset-' + crypto.randomUUID()) { const image = await decodeImage(source); assets.set(id, { image, source }); return id; }
  function readFile(file) {
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Файл недоступен.')); reader.readAsDataURL(file); });
  }
  async function optimizedImage(file, maxSize) {
    const image = await decodeImage(await readFile(file));
    if (image.naturalWidth * image.naturalHeight > 60000000) throw new Error('Уменьшите изображение до 60 мегапикселей.');
    const ratio = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight)), surface = document.createElement('canvas');
    surface.width = Math.max(1, Math.round(image.naturalWidth * ratio)); surface.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    surface.getContext('2d').drawImage(image, 0, 0, surface.width, surface.height);
    return surface.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp', 0.92);
  }
  async function loadFile(file, isLogo = false) {
    if (!file) return; const idStatus = isLogo ? 'brand-logo-status' : 'file-status', cap = isLogo ? 2 : 10;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > cap * 1024 * 1024) { status(idStatus, `Выберите JPG, PNG или WebP до ${cap} МБ.`, true); return; }
    const version = isLogo ? ++logoVersion : ++photoVersion; status(idStatus, 'Читаем изображение…');
    try {
      const source = await optimizedImage(file, isLogo ? 800 : 2200), id = await registerAsset(source);
      if (version !== (isLogo ? logoVersion : photoVersion)) { assets.delete(id); return; }
      commit(); model[isLogo ? 'logoId' : 'photoId'] = id;
      if (!isLogo) model.settings.photo = renderer.normalize({}).photo;
      syncForm(); status(idStatus, `${isLogo ? 'Логотип' : 'Фото'}: ${file.name}`); edited(true);
    } catch (error) { if (version === (isLogo ? logoVersion : photoVersion)) status(idStatus, error.message, true); }
  }
  async function loadSample(key, initialize = false) {
    if (!samples[key]) return; const version = ++photoVersion; status('file-status', 'Загружаем пример…');
    try {
      const id = 'sample-' + key; if (!assets.has(id)) await registerAsset(window.SATUCARD_DEMO_IMAGES[key], id);
      if (version !== photoVersion) return; if (!initialize) commit();
      model.photoId = id; model.settings = renderer.normalize({ ...model.settings, ...samples[key], oldPrice: null, photo: renderer.normalize({}).photo }); syncForm();
      status('file-status', 'Демонстрационный товар. Загрузите своё фото и укажите его данные.');
      if (initialize) { initialModel = clone(model); history = project.createHistory(model); initialized = true; updateHistory(); requestRender(true); } else edited(true);
    } catch (error) { status('file-status', error.message, true); if (initialize) { initialized = true; initialModel = clone(model); history = project.createHistory(model); updateHistory(); requestRender(true); } }
  }
  async function restoreProject(value) {
    const parsed = project.parseProject(value, renderer.normalize), version = ++projectVersion;
    const photoId = parsed.photo ? await registerAsset(parsed.photo) : null, logoId = parsed.logo ? await registerAsset(parsed.logo) : null;
    if (version !== projectVersion) return; commit(); ++photoVersion; ++logoVersion;
    model = { settings: parsed.settings, photoId, logoId }; syncForm(); edited(true); fitPreview();
    status('file-status', photoId ? 'Фото восстановлено из проекта.' : 'Загрузите фото товара.'); status('brand-logo-status', logoId ? 'Логотип восстановлен из проекта.' : '');
  }
  function activateTab(key, focus = false) {
    document.querySelectorAll('[data-editor-tab]').forEach(button => { const active = button.dataset.editorTab === key; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; button.classList.toggle('is-active', active); if (active && focus) button.focus(); });
    document.querySelectorAll('[data-editor-panel]').forEach(panel => { panel.hidden = panel.dataset.editorPanel !== key; });
  }
  function fitPreview() {
    const stage = $('preview-stage'), size = renderer.formats[model.settings.format];
    const availableHeight = Math.max(220, stage.clientHeight - 64);
    const width = Math.max(140, Math.min(model.settings.format === 'story' ? 360 : 500, stage.clientWidth - 48, availableHeight * size.width / size.height));
    $('canvas-frame').style.width = width + 'px'; $('canvas-frame').dataset.baseWidth = width;
    $('preview-zoom').value = '100'; $('preview-zoom-value').value = '100%'; canvas.style.aspectRatio = `${size.width} / ${size.height}`;
  }
  function blobFromCanvas(surface, type, quality) { return new Promise((resolve, reject) => surface.toBlob(blob => blob ? resolve(blob) : reject(new Error('Браузер не смог подготовить изображение.')), type, quality)); }
  async function readyFonts(settings) {
    if (!document.fonts) return;
    const family = settings.font === 'dejavu' ? '"DejaVu Sans"' : 'Manrope';
    await Promise.all([document.fonts.load(`600 24px ${family}`, settings.title), document.fonts.load(`750 24px ${family}`, settings.title)]);
    await document.fonts.ready;
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function exportImage() {
    if (exporting) return; readForm(); commit(); if (!validDetails()) return;
    exporting = true; $('download-button').disabled = true; status('download-status', 'Подготавливаем изображение…');
    try {
      const saved = clone(model.settings), name = filename(), jpeg = $('export-format').value === 'jpeg';
      const photos = imageAssets(), scale = Number($('export-scale').value);
      await readyFonts(saved);
      const surface = document.createElement('canvas'); renderer.render(surface, saved, photos, { scale });
      const blob = await blobFromCanvas(surface, jpeg ? 'image/jpeg' : 'image/png', 0.95);
      downloadBlob(blob, `${name}-${renderer.formats[saved.format].file}.${jpeg ? 'jpg' : 'png'}`);
      status('download-status', `Файл готов: ${surface.width} × ${surface.height}, ${(blob.size / 1024 / 1024).toFixed(1)} МБ. Проверьте загрузки браузера.`);
    } catch (error) { status('download-status', error.message, true); } finally { exporting = false; $('download-button').disabled = false; }
  }
  async function publishCard() {
    if (publishing) return; readForm(); commit(); if (!validDetails(true)) return;
    if (location.protocol === 'file:') { status('publish-status', 'Для публикации откройте сайт SatuCard в интернете.', true); return; }
    const saved = clone(model.settings), photos = imageAssets(), surface = document.createElement('canvas');
    publishing = true; $('publish-button').disabled = true; $('publish-result').hidden = true; status('publish-status', 'Публикуем карточку…');
    try {
      const session = await window.SATUCARD_AUTH?.getSession();
      if (!session) { $('publish-login').hidden = false; status('publish-status', 'Войдите в аккаунт, чтобы сохранить карточку в личном кабинете.'); return; }
      await readyFonts(saved); renderer.render(surface, saved, photos);
      let blob; for (const quality of [0.9, 0.78, 0.64, 0.48]) { blob = await blobFromCanvas(surface, 'image/jpeg', quality); if (blob.size <= 2 * 1024 * 1024) break; }
      if (blob.size > 2 * 1024 * 1024) throw new Error('Изображение превышает 2 МБ. Скачайте его или используйте более простое фото.');
      const data = new FormData(); data.set('image', blob, 'card.jpg'); data.set('title', saved.title); data.set('price', String(saved.price)); data.set('oldPrice', saved.oldPrice ?? '');
      data.set('style', saved.template); data.set('format', saved.format); data.set('brandName', saved.brandName);
      const response = await fetch('api/cards', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: data }), result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось опубликовать карточку.');
      lastPublished = result.url; $('published-url').value = result.url; $('published-card-link').href = result.url;
      $('publish-dialog-link').href = result.url; $('publish-dialog-link').textContent = 'Открыть карточку'; $('publish-dialog-title').textContent = saved.title;
      $('publish-result').hidden = false; status('publish-status', 'Карточка опубликована и сохранена в личном кабинете.');
      if (typeof $('publish-dialog').showModal === 'function') $('publish-dialog').showModal();
    } catch (error) { status('publish-status', error.message || 'Сервер недоступен. Попробуйте позже.', true); }
    finally { publishing = false; $('publish-button').disabled = false; }
  }
  async function copyLink(target) {
    if (!lastPublished) return;
    try { await navigator.clipboard.writeText(lastPublished); target.textContent = 'Скопировано'; }
    catch (_) { $('published-url').focus(); $('published-url').select(); status('publish-status', 'Скопируйте выделенную ссылку: Ctrl+C.'); }
    setTimeout(() => { target.textContent = 'Копировать ссылку'; }, 2200);
  }

  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', event => { if (event.target.type === 'file') return; readForm(); edited(false, false); if (event.target.id === 'card-format') fitPreview(); });
  form.addEventListener('change', event => { if (event.target.type === 'file') return; readForm(); commit(); requestRender(true); if (event.target.id === 'card-format') fitPreview(); if (event.target.id === 'font-family') readyFonts(model.settings).then(() => requestRender(true)).catch(() => status('project-status', 'Шрифт недоступен. Используется запасной шрифт.', true)); });
  form.addEventListener('focusout', commit);
  $('photo-input').addEventListener('change', event => { loadFile(event.target.files[0]); event.target.value = ''; });
  $('brand-logo').addEventListener('change', event => { loadFile(event.target.files[0], true); event.target.value = ''; });
  $('brand-logo-remove').addEventListener('click', () => { ++logoVersion; commit(); model.logoId = null; syncForm(); status('brand-logo-status', 'Логотип удалён.'); edited(true); });
  const zone = $('drop-zone');
  ['dragenter', 'dragover'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove('drag-over'); }));
  zone.addEventListener('drop', event => loadFile(event.dataTransfer.files[0]));
  document.querySelectorAll('[data-sample]').forEach(button => button.addEventListener('click', () => loadSample(button.dataset.sample)));
  $('template-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-template]'); if (!button) return; commit(); const template = renderer.templates[button.dataset.template];
    model.settings = renderer.normalize({ ...model.settings, template: button.dataset.template, customColors: false, background: template.background, accent: template.accent, textColor: template.textColor }); syncForm(); edited(true);
  });
  document.querySelectorAll('[data-palette]').forEach(button => button.addEventListener('click', () => { commit(); const [background, accent, textColor] = palettes[button.dataset.palette]; model.settings = renderer.normalize({ ...model.settings, customColors: true, background, accent, textColor }); syncForm(); edited(true); }));
  document.querySelectorAll('[data-photo-filter]').forEach(button => button.addEventListener('click', () => {
    const filters = { original: [100, 100, 100], mono: [100, 110, 0], vivid: [103, 115, 130], soft: [110, 90, 85] }; commit();
    const [brightness, contrast, saturation] = filters[button.dataset.photoFilter]; model.settings.photo = { ...model.settings.photo, brightness, contrast, saturation }; syncForm(); edited(true);
  }));
  $('reset-photo-button').addEventListener('click', () => { commit(); model.settings.photo = renderer.normalize({}).photo; syncForm(); edited(true); });
  document.querySelectorAll('[data-editor-tab]').forEach(button => {
    button.addEventListener('click', () => activateTab(button.dataset.editorTab));
    button.addEventListener('keydown', event => {
      const keys = ['photo', 'content', 'design'], index = keys.indexOf(button.dataset.editorTab);
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); activateTab(event.key === 'Home' ? keys[0] : event.key === 'End' ? keys[2] : keys[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3], true); }
    });
  });
  $('undo-button').addEventListener('click', () => undoRedo('undo')); $('redo-button').addEventListener('click', () => undoRedo('redo'));
  document.addEventListener('keydown', event => {
    if (event.target.matches('input[type="text"],textarea,[contenteditable="true"]') || !(event.ctrlKey || event.metaKey) || !initialized) return;
    if (['z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); undoRedo(event.shiftKey || event.key.toLowerCase() === 'y' ? 'redo' : 'undo'); }
  });
  $('reset-button').addEventListener('click', () => { if (!initialModel) return; commit(); ++photoVersion; ++logoVersion; ++projectVersion; model = clone(initialModel); syncForm(); edited(true); fitPreview(); status('file-status', 'Исходный демонстрационный товар. Сброс можно отменить.'); status('brand-logo-status', ''); });
  $('preview-zoom').addEventListener('input', () => { $('canvas-frame').style.width = Number($('canvas-frame').dataset.baseWidth || 460) * Number($('preview-zoom').value) / 100 + 'px'; $('preview-zoom-value').value = $('preview-zoom').value + '%'; });
  $('preview-fit-button').addEventListener('click', fitPreview); window.addEventListener('resize', fitPreview);
  canvas.addEventListener('pointerdown', event => {
    if (!model.photoId || !geometry?.photoRect || event.button > 0) return;
    const box = canvas.getBoundingClientRect(), scale = 900 / box.width, point = { x: (event.clientX - box.left) * scale, y: (event.clientY - box.top) * scale }, rect = geometry.photoRect;
    if (point.x < rect.x || point.x > rect.x + rect.width || point.y < rect.y || point.y > rect.y + rect.height) return;
    event.preventDefault(); commit(); canvas.setPointerCapture(event.pointerId);
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: model.settings.photo.x, startY: model.settings.photo.y, scale, rect }; canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== dragging.id) return;
    model.settings.photo.x = Math.max(0, Math.min(100, dragging.startX + (event.clientX - dragging.x) * dragging.scale / (dragging.rect.width * 0.7) * 100));
    model.settings.photo.y = Math.max(0, Math.min(100, dragging.startY + (event.clientY - dragging.y) * dragging.scale / (dragging.rect.height * 0.7) * 100));
    $('photo-position-x').value = model.settings.photo.x; $('photo-position-y').value = model.settings.photo.y; updateOutputs(); requestRender();
  });
  function endDrag(event) { if (!dragging || event.pointerId !== dragging.id) return; dragging = null; canvas.classList.remove('is-dragging'); edited(); }
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => canvas.addEventListener(type, endDrag));
  $('fullscreen-button').addEventListener('click', () => { renderer.render($('fullscreen-canvas'), model.settings, imageAssets()); $('fullscreen-dialog').showModal(); });
  $('fullscreen-close').addEventListener('click', () => $('fullscreen-dialog').close()); $('publish-dialog-close').addEventListener('click', () => $('publish-dialog').close());
  $('download-button').addEventListener('click', exportImage); $('publish-button').addEventListener('click', publishCard); $('export-format').addEventListener('change', () => requestRender());
  $('copy-link-button').addEventListener('click', event => copyLink(event.currentTarget)); $('publish-dialog-copy').addEventListener('click', event => copyLink(event.currentTarget));
  $('save-project-button').addEventListener('click', () => { try { readForm(); commit(); downloadBlob(new Blob([serialized()], { type: 'application/json' }), filename() + '.satucard.json'); status('project-status', 'Проект подготовлен: фото, логотип и все настройки.'); } catch (error) { status('project-status', error.message, true); } });
  $('load-project-input').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    try { if (file.size > 17 * 1024 * 1024) throw new Error('Проект слишком большой. Максимум 17 МБ.'); status('project-status', 'Открываем проект…'); await restoreProject(await file.text()); status('project-status', 'Проект открыт. Предыдущее состояние можно вернуть кнопкой отмены.'); }
    catch (error) { status('project-status', error.message, true); }
  });
  $('restore-draft-button').addEventListener('click', async () => { try { if (!pendingDraft) return; await restoreProject(pendingDraft); pendingDraft = null; $('draft-restore-banner').hidden = true; status('project-status', 'Черновик восстановлен вместе с фотографией.'); } catch (error) { status('project-status', error.message, true); } });
  $('discard-draft-button').addEventListener('click', async () => { pendingDraft = null; $('draft-restore-banner').hidden = true; clearTimeout(draftTimer); try { draftQueue = draftQueue.catch(() => {}).then(() => project.draftAction('delete')); await draftQueue; status('draft-status', 'Начните редактирование — черновик сохранится автоматически.'); } catch (_) { status('draft-status', 'Хранилище недоступно. Скачайте проект.'); } });
  async function updateAuth() { const session = Boolean(await window.SATUCARD_AUTH?.getSession()); $('publish-login').hidden = session; if ($('publish-login-note')) $('publish-login-note').hidden = session; }
  document.addEventListener('satucard:authchange', updateAuth); updateAuth();
  async function initialize() {
    buildTemplates(); activateTab('photo'); syncForm(); fitPreview(); const params = new URLSearchParams(location.search);
    document.querySelectorAll('[data-palette]').forEach(button => { const chip = button.querySelector('i'); palettes[button.dataset.palette].forEach((color, index) => chip.style.setProperty('--palette-' + ['a', 'b', 'c'][index], color)); });
    if (renderer.templates[params.get('style')]) model.settings.template = params.get('style'); if (renderer.formats[params.get('format')]) model.settings.format = params.get('format');
    await loadSample(samples[params.get('photo')] ? params.get('photo') : 'headphones', true);
    if (!initialized) { initialModel = clone(model); history = project.createHistory(model); initialized = true; updateHistory(); requestRender(true); }
    form.inert = false;
    ['download-button', 'publish-button', 'save-project-button', 'load-project-input'].forEach(id => { $(id).disabled = false; });
    fitPreview();
    try { const saved = await project.draftAction('get'); if (saved) { project.parseProject(saved, renderer.normalize); pendingDraft = saved; $('draft-restore-banner').hidden = false; status('draft-status', 'На этом устройстве есть сохранённый черновик.'); } else status('draft-status', 'Изменения сохраняются на этом устройстве.'); }
    catch (_) { status('draft-status', 'Автосохранение недоступно — используйте «Сохранить проект».'); }
    document.fonts?.ready.then(() => requestRender(true));
  }
  initialize();
})();
