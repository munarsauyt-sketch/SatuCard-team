'use strict';

// Editing is local. Cloud save and AI requests are separate explicit actions.
(() => {
  const $ = id => document.getElementById(id);
  const form = $('editor-form'), renderer = window.SATUCARD_RENDERER, project = window.SATUCARD_PROJECT;
  if (!form || !renderer || !project) return;
  form.inert = true;
  ['download-button', 'publish-button', 'save-project-button', 'load-project-input'].forEach(id => { $(id).disabled = true; });
  const canvas = $('product-canvas'), assets = new Map(), pendingAssets = new Set();
  const palettes = {
    forest: ['#e1e8d9', '#466343', '#233126'], orange: ['#fff0e5', '#f06435', '#35251f'],
    ocean: ['#dcedf5', '#087da1', '#112c3d'], violet: ['#ece5ff', '#8053df', '#2a2041'], rose: ['#fce5ed', '#c34f7a', '#462232']
  };
  const samples = window.SATUCARD_SAMPLES;
  const textFields = { 'product-name': 'title', 'product-subtitle': 'subtitle', 'product-description': 'description', 'product-badge': 'badge', 'brand-name': 'brandName' };
  const selectFields = { 'card-format': 'format', 'font-family': 'font', 'text-align': 'textAlign', 'card-purpose': 'purpose', 'product-category': 'category' };
  const colorFields = { 'background-color': 'background', 'accent-color': 'accent', 'text-color': 'textColor' };
  const checkFields = { 'show-price': 'showPrice', 'show-brand': 'showBrand', 'custom-colors': 'customColors' };
  const photoRanges = { 'photo-zoom': 'zoom', 'photo-position-x': 'x', 'photo-position-y': 'y', 'photo-rotation': 'rotation', 'photo-brightness': 'brightness', 'photo-contrast': 'contrast', 'photo-saturation': 'saturation', 'photo-radius': 'radius' };
  const copyFields = ['title', 'subtitle', 'description', 'features'];
  let model = { settings: renderer.normalize({ ...samples.headphones, brandName: 'SatuCard.', template: 'neon', format: 'portrait' }), photoId: null, photoIds: [], libraryIds: [], logoId: null, productContextId: 0 };
  let initialModel, history, geometry, dragging, pendingDraft;
  let framePending = false, initialized = false, publishing = false, exporting = false;
  let historyTimer, draftTimer, thumbTimer, lastPublished = '';
  let photoVersion = 0, logoVersion = 0, projectVersion = 0;
  let draftQueue = Promise.resolve();
  let revision = 0, productContextVersion = 0;
  const activeView = () => model.views.find(view => view.id === model.activeViewId);
  function changeProductContext() { model.productContextId = ++productContextVersion; }
  function syncActiveView() {
    if (!model.views) { model.activeViewId = "main"; model.views = [{ id: "main", label: "Главная", settings: clone(model.settings), sampleKey: 'headphones' }]; }
    const active = activeView();
    if (active) { active.settings = clone(model.settings); active.photoIds = [...model.photoIds]; }
  }
  function notifyChange() { revision++; document.dispatchEvent(new Event("satucard:editor-change")); }
  const clone = value => JSON.parse(JSON.stringify(value));
  const imageAssets = (view = model) => {
    const photos = (view.photoIds || []).map(id => assets.get(id)?.image).filter(Boolean);
    return { photo: photos[0] || null, photos, logo: assets.get(model.logoId)?.image || null };
  };
  function setPhotoIds(ids) { model.photoIds = [...ids]; model.photoId = ids[0] || null; }
  function photoSources() { return model.libraryIds.map(id => ({ id, source: assets.get(id).source })); }
  const demoPhoto = id => assets.get(id)?.sampleKey;
  function withoutSampleSettings(settings, sampleKey) {
    if (!sampleKey) return settings;
    const sample = renderer.normalize(samples[sampleKey]);
    const result = { ...settings, features: settings.features.filter(value => !sample.features.includes(value)) };
    for (const key of ['title', 'subtitle', 'description', 'badge']) {
      if (settings[key] === sample[key]) result[key] = '';
    }
    if (settings.category === sample.category) result.category = 'generic';
    if (settings.price === sample.price && settings.oldPrice === null) result.price = null;
    return result;
  }
  function clearDemoContext(view, ids) {
    if (!view.sampleKey || ids.some(demoPhoto)) return false;
    view.settings = withoutSampleSettings(view.settings, view.sampleKey);
    delete view.sampleKey;
    return true;
  }
  function replaceSelectedPhotos(ids) {
    const view = activeView();
    const newProduct = clearDemoContext(view, ids);
    if (newProduct) {
      model.settings = view.settings;
      changeProductContext();
    }
    if (ids[0] !== model.photoId) model.settings.photo = renderer.normalize({}).photo;
    setPhotoIds(ids);
    return newProduct;
  }
  function selectPhotos(ids) {
    cancelDrag(); ++photoVersion; commit(); replaceSelectedPhotos(ids);
    syncForm(); edited(true);
  }
  function renderPhotoLibrary() {
    const library = $('photo-library'), selected = $('selected-photos'); library.replaceChildren(); selected.replaceChildren();
    $('photo-count').textContent = `${model.photoIds.length} / 3 на карточке · ${model.libraryIds.length} / 12 в проекте`;
    model.libraryIds.forEach((id, index) => {
      const item = document.createElement('div'), button = document.createElement('button'), img = document.createElement('img'), remove = document.createElement('button');
      button.type = 'button'; button.className = 'photo-choice'; button.setAttribute('aria-pressed', String(model.photoIds.includes(id)));
      button.setAttribute('aria-label', `${model.photoIds.includes(id) ? 'Убрать с карточки' : 'Добавить на карточку'} фото ${index + 1}`);
      img.src = assets.get(id).source; img.alt = ''; button.append(img);
      const badge = document.createElement('span'); badge.textContent = model.photoIds.includes(id) ? String(model.photoIds.indexOf(id) + 1) : '+'; button.append(badge);
      button.addEventListener('click', () => {
        if (model.photoIds.includes(id)) selectPhotos(model.photoIds.filter(value => value !== id));
        else if (model.photoIds.length < 3) selectPhotos([...model.photoIds, id]);
        else status('file-status', 'На карточке до 3 фото. Уберите одно, затем выберите другое.', true);
      });
      remove.type = 'button'; remove.className = 'photo-delete'; remove.textContent = '×'; remove.setAttribute('aria-label', `Удалить фото ${index + 1} из проекта`);
      remove.addEventListener('click', () => {
        cancelDrag(); ++photoVersion; commit(); model.libraryIds = model.libraryIds.filter(value => value !== id);
        for (const view of model.views) {
          if (view.id === model.activeViewId) continue;
          const remaining = view.photoIds.filter(value => value !== id);
          if (view.photoIds[0] === id) view.settings.photo = renderer.normalize({}).photo;
          clearDemoContext(view, remaining);
          view.photoIds = remaining;
        }
        replaceSelectedPhotos(model.photoIds.filter(value => value !== id));
        syncForm(); edited(true); status('file-status', 'Фото удалено из всех карточек. Действие можно отменить.');
      });
      item.className = 'photo-library-item'; item.append(button, remove); library.append(item);
    });
    model.photoIds.forEach((id, index) => {
      const row = document.createElement('div'), text = document.createElement('span'); text.textContent = `${index + 1}. Фото ${model.libraryIds.indexOf(id) + 1}${index ? '' : ' · главное'}`; row.append(text);
      for (const [delta, label] of [[-1, '←'], [1, '→']]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.disabled = index + delta < 0 || index + delta >= model.photoIds.length;
        button.setAttribute('aria-label', `Фото ${index + 1}: ${delta < 0 ? 'раньше' : 'позже'}`);
        button.addEventListener('click', () => { const ids = [...model.photoIds]; [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]]; selectPhotos(ids); }); row.append(button);
      }
      selected.append(row);
    });
  }
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
    $('brand-logo-remove').disabled = !model.logoId; updateOutputs(); renderPhotoLibrary(); updateContentHints();
  }
  function updateOutputs() {
    $('name-count').textContent = `${$('product-name').value.length} / 60`;
    for (const [id, key] of Object.entries(photoRanges)) $(id + '-value').value = $(id).value + (key === 'rotation' ? '°' : key === 'radius' ? ' px' : '%');
    $('text-scale-value').value = $('text-scale').value + '%';
    for (const id of Object.keys(colorFields)) $(id).disabled = !$('custom-colors').checked;
  }
  function updateContentHints() {
    const purpose = model.settings.purpose || 'cover', category = model.settings.category || 'generic';
    const labels = { cover: 'Преимущества', advantages: 'Преимущества', dimensions: 'Размеры', specifications: 'Характеристики', contents: 'В комплекте', instructions: 'Шаги инструкции' };
    $('feature-heading').textContent = labels[purpose];
    const examples = { generic: ['Материал: …', 'Размер: …', 'Комплектация: …'], electronics: ['Подключение: …', 'Питание: …', 'Совместимость: …'], clothing: ['Размер: …', 'Состав: …', 'Уход: …'], beauty: ['Объём: …', 'Состав: …', 'Применение: …'], home: ['Материал: …', 'Габариты: …', 'Комплектация: …'] };
    [1, 2, 3].forEach(index => { $('feature-' + index).placeholder = purpose === 'instructions' ? `Шаг ${index}: …` : purpose === 'dimensions' ? ['Ширина: … см', 'Высота: … см', 'Глубина: … см'][index - 1] : examples[category][index - 1]; $('feature-label-' + index).textContent = `${labels[purpose]} · ${index}`; });
    $('purpose-help').textContent = 'Макет меняет расположение элементов. Категория подсказывает поля, но не добавляет факты за вас.';
  }
  function clearPublished() { $('publish-result').hidden = true; if (!publishing) status('publish-status', ''); }
  function renderNow() {
    framePending = false; geometry = renderer.render(canvas, model.settings, imageAssets());
    const size = renderer.formats[model.settings.format];
    $('format-description').textContent = `${size.label} · ${size.width} × ${size.height}`;
    const cardName = model.settings.title ? 'Карточка: ' + model.settings.title : 'Карточка без названия';
    $('preview-caption').textContent = cardName + '. Шаблон ' + renderer.templates[model.settings.template].label + '.';
    canvas.setAttribute('aria-label', $('preview-caption').textContent);
    $('download-button').querySelector('span').textContent = $('export-format').value === 'jpeg' ? 'Скачать JPEG' : 'Скачать PNG';
    document.querySelectorAll('[data-template]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.template === model.settings.template)));
    document.querySelectorAll('[data-sample]').forEach(button => button.setAttribute('aria-pressed', String(model.photoId === 'sample-' + button.dataset.sample)));
    const filters = { original: [100, 100, 100], mono: [100, 110, 0], vivid: [103, 115, 130], soft: [110, 90, 85] };
    document.querySelectorAll('[data-photo-filter]').forEach(button => button.setAttribute('aria-pressed', String(filters[button.dataset.photoFilter].every((value, index) => value === model.settings.photo[['brightness', 'contrast', 'saturation'][index]]))));
    document.querySelectorAll('[data-palette]').forEach(button => button.setAttribute('aria-pressed', String(model.settings.customColors && palettes[button.dataset.palette].every((value, index) => value === model.settings[['background', 'accent', 'textColor'][index]]))));
    if ($('fullscreen-dialog').open) renderer.render($('fullscreen-canvas'), model.settings, imageAssets());
    if ($('phone-dialog').open) renderer.render($('phone-canvas'), model.settings, imageAssets());
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
    syncActiveView(); history.push(model); updateHistory();
  }
  function releaseUnusedAssets() {
    if (!history) return;
    const retained = new Set(history.retained().flatMap(entry => [...(entry.libraryIds || []), entry.logoId]));
    if (initialModel) { initialModel.libraryIds.forEach(id => retained.add(id)); retained.add(initialModel.logoId); }
    for (const key of assets.keys()) if (!key.startsWith('sample-') && !retained.has(key) && !pendingAssets.has(key)) assets.delete(key);
  }
  function edited(thumbs = false, immediate = true) {
    if (pendingDraft) { pendingDraft = null; $('draft-restore-banner').hidden = true; }
    clearPublished(); status('download-status', ''); requestRender(thumbs);
    if (immediate) { commit(); releaseUnusedAssets(); } else { clearTimeout(historyTimer); historyTimer = setTimeout(commit, 600); }
    notifyChange(); saveDraftSoon();
  }
  function cancelDrag() {
    if (!dragging) return;
    const pointerId = dragging.id; dragging = null; canvas.classList.remove('is-dragging');
    if (canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId);
  }
  function undoRedo(direction) {
    if (dragging) { cancelDrag(); commit(); }
    document.dispatchEvent(new Event('satucard:history-navigation'));
    // Flush an in-progress edit before moving the history cursor.
    if (historyTimer) { clearTimeout(historyTimer); historyTimer = null; commit(); }
    ++photoVersion; ++logoVersion; ++projectVersion;
    model = direction === 'undo' ? history.undo() : history.redo();
    syncForm(); updateHistory(); clearPublished(); requestRender(true); fitPreview(); notifyChange(); saveDraftSoon();
    status('file-status', model.photoId ? 'Фото из выбранного состояния истории.' : 'Загрузите фото товара.');
    status('brand-logo-status', model.logoId ? 'Логотип из выбранного состояния истории.' : '');
  }
  function serialized() {
    syncActiveView();
    const views = model.views.map(({ id, label, settings, photoIds }) => ({ id, label, settings, photoIds }));
    return project.serializeProject(model.settings, assets.get(model.photoId)?.source || null, assets.get(model.logoId)?.source || null,
      { views, activeViewId: model.activeViewId, photos: photoSources() });
  }
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
  async function registerAsset(source, id = 'asset-' + crypto.randomUUID()) {
    const image = await decodeImage(source);
    const sampleKey = Object.keys(samples).find(key => window.SATUCARD_DEMO_IMAGES?.[key] === source);
    assets.set(id, { image, source, sampleKey }); pendingAssets.add(id); return id;
  }
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
    if (!isLogo) return loadPhotos(file ? [file] : []);
    if (!file) return; const idStatus = isLogo ? 'brand-logo-status' : 'file-status', cap = isLogo ? 2 : 10;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > cap * 1024 * 1024) { status(idStatus, `Выберите JPG, PNG или WebP до ${cap} МБ.`, true); return; }
    const version = isLogo ? ++logoVersion : ++photoVersion; status(idStatus, 'Читаем изображение…');
    try {
      const source = await optimizedImage(file, isLogo ? 800 : 2200), id = await registerAsset(source);
      if (version !== (isLogo ? logoVersion : photoVersion)) { pendingAssets.delete(id); assets.delete(id); return; }
      commit(); model[isLogo ? 'logoId' : 'photoId'] = id; pendingAssets.delete(id);
      if (!isLogo) model.settings.photo = renderer.normalize({}).photo;
      syncForm(); status(idStatus, `${isLogo ? 'Логотип' : 'Фото'}: ${file.name}`); edited(true);
    } catch (error) { if (version === (isLogo ? logoVersion : photoVersion)) status(idStatus, error.message, true); }
  }
  async function loadPhotos(files) {
    if (!files.length) return;
    if (model.libraryIds.length + files.length > 12) { status('file-status', 'В проекте до 12 фото. Удалите ненужные снимки.', true); return; }
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024)) { status('file-status', 'Выберите JPG, PNG или WebP до 10 МБ каждый.', true); return; }
    const version = ++photoVersion, viewId = model.activeViewId, added = [];
    status('file-status', 'Добавляем фотографии…');
    try {
      for (const file of files) {
        const source = await optimizedImage(file, 1800); added.push(await registerAsset(source));
        if (version !== photoVersion || viewId !== model.activeViewId) throw new Error('Выбор карточки или фото изменился. Загрузите файлы ещё раз.');
      }
      commit(); model.libraryIds.push(...added);
      // A first real upload must not quietly export the demo product alongside it.
      const selected = model.photoIds.filter(id => !demoPhoto(id));
      const newProduct = replaceSelectedPhotos([...selected, ...added].slice(0, 3));
      syncForm(); edited(true);
      status('file-status', newProduct
        ? 'Фото загружено. Укажите название и данные своего товара.'
        : 'Добавлено фото: ' + added.length + '. Нажимайте миниатюры, чтобы выбрать до 3 для этой карточки.');
    } catch (error) { added.forEach(id => assets.delete(id)); if (version === photoVersion) status('file-status', error.message, true); }
    finally { added.forEach(id => pendingAssets.delete(id)); releaseUnusedAssets(); }
  }
  async function loadSample(key, initialize = false) {
    if (!Object.hasOwn(samples, key)) return; const version = ++photoVersion; status('file-status', 'Загружаем пример…');
    try {
      const id = 'sample-' + key; if (!assets.has(id)) await registerAsset(window.SATUCARD_DEMO_IMAGES[key], id);
      pendingAssets.delete(id); if (version !== photoVersion) return; if (!initialize) commit();
      if (!model.libraryIds.includes(id)) { if (model.libraryIds.length >= 12) throw new Error('В проекте до 12 фото. Удалите ненужный снимок.'); model.libraryIds.push(id); }
      setPhotoIds([id]);
      model.settings = renderer.normalize({ ...model.settings, ...samples[key], oldPrice: null, photo: { ...renderer.normalize({}).photo, ...samples[key].photo } });
      syncActiveView(); activeView().sampleKey = key; changeProductContext(); syncForm();
      status('file-status', 'Демонстрационный товар. Загрузите своё фото и укажите его данные.');
      if (initialize) { syncActiveView(); initialModel = clone(model); history = project.createHistory(model); initialized = true; updateHistory(); requestRender(true); } else edited(true);
    } catch (error) { status('file-status', error.message, true); if (initialize) { initialized = true; syncActiveView(); initialModel = clone(model); history = project.createHistory(model); updateHistory(); requestRender(true); } }
  }
  async function restoreProject(value, expectedRevision, cancelled = () => false) {
    const parsed = project.parseProject(value, renderer.normalize), version = ++projectVersion, started = revision;
    ++photoVersion; ++logoVersion;
    const loaded = [];
    try {
      const refs = new Map();
      for (const item of parsed.photos || []) { const id = await registerAsset(item.source); loaded.push(id); refs.set(item.id, id); }
      const legacyPhoto = parsed.photo ? await registerAsset(parsed.photo) : null; if (legacyPhoto) loaded.push(legacyPhoto);
      const logoId = parsed.logo ? await registerAsset(parsed.logo) : null; if (logoId) loaded.push(logoId);
      if (cancelled() || version !== projectVersion || started !== revision || (expectedRevision !== undefined && expectedRevision !== revision)) throw new Error("Проект изменился во время загрузки. Откройте файл ещё раз.");
      cancelDrag(); commit(); ++photoVersion; ++logoVersion;
      const views = (parsed.views || [{ id: 'main', label: 'Главная', settings: parsed.settings }]).map(view => {
        const photoIds = parsed.photos ? view.photoIds.map(id => refs.get(id)) : legacyPhoto ? [legacyPhoto] : [];
        return { ...view, photoIds, sampleKey: demoPhoto(photoIds[0]) };
      });
      const activeViewId = parsed.activeViewId || 'main', active = views.find(view => view.id === activeViewId);
      model = { settings: parsed.settings, photoId: active.photoIds[0] || null, photoIds: [...active.photoIds], libraryIds: parsed.photos ? [...refs.values()] : legacyPhoto ? [legacyPhoto] : [], logoId, views, activeViewId };
      changeProductContext(); syncActiveView(); syncForm(); edited(true); fitPreview();
      status('file-status', model.libraryIds.length ? 'Фотографии восстановлены из проекта.' : 'Загрузите фото товара.'); status('brand-logo-status', logoId ? 'Логотип восстановлен из проекта.' : '');
    } catch (error) { loaded.forEach(id => assets.delete(id)); throw error; }
    finally { loaded.forEach(id => pendingAssets.delete(id)); releaseUnusedAssets(); }
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
      const surface = document.createElement('canvas'); const layout = renderer.render(surface, saved, photos, { scale });
      const blob = await blobFromCanvas(surface, jpeg ? 'image/jpeg' : 'image/png', 0.95);
      window.SATUCARD_WORKFLOW?.showPreflight(saved, photos, surface, blob, layout);
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
      const profile = await window.SATUCARD_AUTH.getProfile();
      if (!profile?.profile_completed_at) {
        $('publish-login').href = 'profile.html?registration=1'; $('publish-login').textContent = 'Завершите регистрацию';
        $('publish-login').hidden = false; $('publish-login-note').hidden = false;
        status('publish-status', 'Перед публикацией укажите имя и фамилию в профиле. Черновик карточки сохранён в этом браузере.'); return;
      }
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
  form.addEventListener('input', event => { if (event.target.type === 'file' || event.target.closest('[data-workflow-control]')) return; readForm(); edited(false, false); if (event.target.id === 'card-format') fitPreview(); if (['card-purpose', 'product-category'].includes(event.target.id)) updateContentHints(); });
  form.addEventListener('change', event => { if (event.target.type === 'file' || event.target.closest('[data-workflow-control]')) return; readForm(); commit(); requestRender(true); if (event.target.id === 'card-format') fitPreview(); if (['card-purpose', 'product-category'].includes(event.target.id)) updateContentHints(); if (event.target.id === 'font-family') readyFonts(model.settings).then(() => requestRender(true)).catch(() => status('project-status', 'Шрифт недоступен. Используется запасной шрифт.', true)); });
  form.addEventListener('focusout', commit);
  $('photo-input').addEventListener('change', event => { loadPhotos([...event.target.files]); event.target.value = ''; });
  $('brand-logo').addEventListener('change', event => { loadFile(event.target.files[0], true); event.target.value = ''; });
  $('brand-logo-remove').addEventListener('click', () => { ++logoVersion; commit(); model.logoId = null; syncForm(); status('brand-logo-status', 'Логотип удалён.'); edited(true); });
  const zone = $('drop-zone');
  ['dragenter', 'dragover'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove('drag-over'); }));
  zone.addEventListener('drop', event => loadPhotos([...event.dataTransfer.files]));
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
  $('reset-button').addEventListener('click', () => { if (!initialModel) return; cancelDrag(); commit(); ++photoVersion; ++logoVersion; ++projectVersion; model = clone(initialModel); changeProductContext(); syncForm(); edited(true); fitPreview(); status('file-status', 'Исходный демонстрационный товар. Сброс можно отменить.'); status('brand-logo-status', ''); });
  $('preview-zoom').addEventListener('input', () => { $('canvas-frame').style.width = Number($('canvas-frame').dataset.baseWidth || 460) * Number($('preview-zoom').value) / 100 + 'px'; $('preview-zoom-value').value = $('preview-zoom').value + '%'; });
  $('preview-fit-button').addEventListener('click', fitPreview); window.addEventListener('resize', fitPreview);
  canvas.addEventListener('pointerdown', event => {
    if (!model.photoId || !geometry?.photoRect || event.button > 0) return;
    const box = canvas.getBoundingClientRect(), scale = 900 / box.width, point = { x: (event.clientX - box.left) * scale, y: (event.clientY - box.top) * scale }, rect = geometry.photoRect;
    if (point.x < rect.x || point.x > rect.x + rect.width || point.y < rect.y || point.y > rect.y + rect.height) return;
    event.preventDefault(); commit(); revision++; canvas.setPointerCapture(event.pointerId);
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: model.settings.photo.x, startY: model.settings.photo.y, scale, rect }; canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== dragging.id) return;
    revision++;
    model.settings.photo.x = Math.max(0, Math.min(100, dragging.startX + (event.clientX - dragging.x) * dragging.scale / (dragging.rect.width * 0.7) * 100));
    model.settings.photo.y = Math.max(0, Math.min(100, dragging.startY + (event.clientY - dragging.y) * dragging.scale / (dragging.rect.height * 0.7) * 100));
    $('photo-position-x').value = model.settings.photo.x; $('photo-position-y').value = model.settings.photo.y; updateOutputs(); requestRender();
  });
  function endDrag(event) { if (!dragging || event.pointerId !== dragging.id) return; dragging = null; canvas.classList.remove('is-dragging'); edited(); }
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => canvas.addEventListener(type, endDrag));
  $('phone-preview-button').addEventListener('click', () => { renderer.render($('phone-canvas'), model.settings, imageAssets()); $('phone-dialog').showModal(); });
  $('phone-close').addEventListener('click', () => $('phone-dialog').close());
  canvas.addEventListener('dblclick', event => {
    const bounds = canvas.getBoundingClientRect(), scale = 900 / bounds.width, x = (event.clientX - bounds.left) * scale, y = (event.clientY - bounds.top) * scale;
    const area = geometry?.hitAreas?.find(area => x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height);
    if (area && $(area.field)) { activateTab('content'); $(area.field).focus(); $(area.field).select?.(); $(area.field).scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }
  });
  $('fullscreen-button').addEventListener('click', () => { renderer.render($('fullscreen-canvas'), model.settings, imageAssets()); $('fullscreen-dialog').showModal(); });
  $('fullscreen-close').addEventListener('click', () => $('fullscreen-dialog').close()); $('publish-dialog-close').addEventListener('click', () => $('publish-dialog').close());
  $('download-button').addEventListener('click', exportImage); $('publish-button').addEventListener('click', publishCard); $('export-format').addEventListener('change', () => requestRender());
  $('copy-link-button').addEventListener('click', event => copyLink(event.currentTarget)); $('publish-dialog-copy').addEventListener('click', event => copyLink(event.currentTarget));
  $('save-project-button').addEventListener('click', () => { try { readForm(); commit(); downloadBlob(new Blob([serialized()], { type: 'application/json' }), filename() + '.satucard.json'); status('project-status', 'Проект подготовлен: фото, логотип и все настройки.'); } catch (error) { status('project-status', error.message, true); } });
  $('load-project-input').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    const selectedRevision = revision, selectedVersion = ++projectVersion;
    try {
      if (file.size > 17 * 1024 * 1024) throw new Error('Проект слишком большой. Максимум 17 МБ.');
      status('project-status', 'Открываем проект…'); const text = await file.text();
      if (selectedVersion !== projectVersion || selectedRevision !== revision) throw new Error('Проект изменился во время чтения файла. Откройте файл ещё раз.');
      await restoreProject(text, selectedRevision); status('project-status', 'Проект открыт. Предыдущее состояние можно вернуть кнопкой отмены.');
    }
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
    await loadSample(Object.hasOwn(samples, params.get('photo')) ? params.get('photo') : 'headphones', true);
    if (!initialized) { syncActiveView(); initialModel = clone(model); history = project.createHistory(model); initialized = true; updateHistory(); requestRender(true); }
    form.inert = false;
    ['download-button', 'publish-button', 'save-project-button', 'load-project-input'].forEach(id => { $(id).disabled = false; });
    fitPreview();
    try { const saved = await project.draftAction('get'); if (saved) { project.parseProject(saved, renderer.normalize); pendingDraft = saved; $('draft-restore-banner').hidden = false; status('draft-status', 'На этом устройстве есть сохранённый черновик.'); } else status('draft-status', 'Изменения сохраняются на этом устройстве.'); }
    catch (_) { status('draft-status', 'Автосохранение недоступно — используйте «Сохранить проект».'); }
    form.dataset.editorReady = 'true';
    document.dispatchEvent(new Event('satucard:editor-ready'));
    document.fonts?.ready.then(() => requestRender(true));
  }
  // Small integration surface shared by the workflow UI; model changes remain undoable.
  window.SATUCARD_EDITOR = {
    get revision() { return revision; },
    snapshot(includeProject = false) {
      readForm(); syncActiveView();
      const sampleKey = activeView().sampleKey || null;
      return { model: clone(model), productContextId: model.productContextId, sampleKey,
        productSettings: clone(withoutSampleSettings(model.settings, sampleKey)),
        productImages: imageAssets({ photoIds: model.photoIds.filter(id => !demoPhoto(id)) }),
        images: imageAssets(), viewImages: Object.fromEntries(model.views.map(view => [view.id, imageAssets(view)])),
        ...(includeProject ? { serialized: serialized() } : {}), filename: filename() };
    },
    readyFonts, blobFromCanvas, downloadBlob, restoreProject,
    selectView(id) {
      cancelDrag(); ++photoVersion; readForm(); commit(); const view = model.views.find(item => item.id === id); if (!view) return;
      model.activeViewId = id; model.settings = clone(view.settings); setPhotoIds(view.photoIds); syncForm(); edited(true); fitPreview();
    },
    addView() {
      readForm(); commit(); if (model.views.length >= 8) throw new Error('В комплекте не больше 8 карточек.');
      const id = crypto.randomUUID();
      model.views.push({ id, label: 'Карточка ' + (model.views.length + 1), settings: clone(model.settings), photoIds: [...model.photoIds], sampleKey: activeView().sampleKey });
      model.activeViewId = id; syncForm(); edited(true);
    },
    removeView() {
      cancelDrag(); commit(); if (model.views.length <= 1) return;
      model.views = model.views.filter(view => view.id !== model.activeViewId); model.activeViewId = model.views[0].id; model.settings = clone(model.views[0].settings); setPhotoIds(model.views[0].photoIds);
      syncForm(); edited(true); fitPreview();
    },
    renameView(label) { commit(); const view = model.views.find(item => item.id === model.activeViewId); view.label = label.trim().slice(0, 60) || 'Карточка'; edited(); },
    makeSet() {
      readForm(); commit(); if (model.views.length > 6) throw new Error('Для двух новых карточек нужно освободить место в комплекте.');
      const base = clone(model.settings);
      for (const [label, changes] of [
        ['Преимущества', { purpose: 'advantages', subtitle: 'Преимущества', description: '', showPrice: false, badge: '' }],
        ['Подробности', { purpose: 'specifications', subtitle: 'Подробности о товаре', features: [], showPrice: false, badge: '' }]
      ]) model.views.push({ id: crypto.randomUUID(), label, settings: renderer.normalize({ ...base, ...changes }), photoIds: [...model.photoIds], sampleKey: activeView().sampleKey });
      edited(true);
    },
    moveView(delta) {
      cancelDrag(); readForm(); commit(); const index = model.views.findIndex(view => view.id === model.activeViewId), target = index + delta;
      if (target < 0 || target >= model.views.length) return;
      [model.views[index], model.views[target]] = [model.views[target], model.views[index]]; edited(true);
    },
    applyBrand() {
      readForm(); commit(); const keys = ['brandName', 'showBrand', 'customColors', 'background', 'accent', 'textColor', 'font'];
      model.views.forEach(view => { for (const key of keys) view.settings[key] = model.settings[key]; view.settings.customColors = true; });
      model.settings.customColors = true; syncForm(); edited(true);
    },
    applyCopy(draft, expectedRevision, options = {}) {
      if (expectedRevision !== revision) throw new Error('Карточка изменилась. Создайте подсказку заново, чтобы не затереть новые правки.');
      if (options.duplicate && model.views.length >= 8) throw new Error('В комплекте не больше 8 карточек. Освободите место для перевода.');
      const fields = options.fields ?? copyFields;
      if (!Array.isArray(fields) || fields.some(key => !copyFields.includes(key))) throw new Error('Выберите поля для применения.');
      const styling = {};
      if (options.template && Object.hasOwn(renderer.templates, options.template)) {
        styling.template = options.template;
        if (options.replaceColors) { const palette = renderer.templates[options.template]; Object.assign(styling, { customColors: false, background: palette.background, accent: palette.accent, textColor: palette.textColor }); }
        else styling.customColors = true;
      }
      const copy = Object.fromEntries(fields.map(key => [key, draft[key]]));
      const source = activeView(), startingProduct = options.newProduct === true && Boolean(source.sampleKey);
      const photoIds = startingProduct ? model.photoIds.filter(id => !demoPhoto(id)) : [...model.photoIds];
      const base = startingProduct ? withoutSampleSettings(model.settings, source.sampleKey) : model.settings;
      const settings = renderer.normalize({ ...base, ...styling, ...copy,
        photo: photoIds[0] !== model.photoIds[0] ? renderer.normalize({}).photo : base.photo });
      cancelDrag(); commit();
      if (options.duplicate) {
        const suffix = ' · Қазақша';
        const id = crypto.randomUUID(), label = source.label.slice(0, 60 - suffix.length) + suffix;
        model.views.push({ id, label, settings, photoIds, sampleKey: startingProduct ? undefined : source.sampleKey });
        model.activeViewId = id;
      } else if (startingProduct) delete source.sampleKey;
      if (startingProduct) {
        setPhotoIds(photoIds); changeProductContext();
        status('file-status', model.photoId ? 'Фото своего товара выбраны.' : 'Загрузите фото своего товара.');
      }
      model.settings = settings;
      syncForm(); edited(true);
    },
    async replacePhoto(source, expectedRevision) {
      if (expectedRevision !== revision) throw new Error('Фото изменилось. Повторите обработку.');
      const sampleKey = demoPhoto(model.photoId);
      const version = ++photoVersion, id = await registerAsset(source); pendingAssets.delete(id);
      if (expectedRevision !== revision || version !== photoVersion) { assets.delete(id); throw new Error('Фото изменилось. Повторите обработку.'); }
      if (sampleKey) assets.get(id).sampleKey = sampleKey;
      commit();
      // Replace only this card's primary image. Other cards keep their original photo.
      if (model.libraryIds.length >= 12) { assets.delete(id); throw new Error('Для обработанной копии освободите место: в проекте до 12 фото.'); }
      model.libraryIds.push(id); setPhotoIds([id, ...model.photoIds.slice(1)]); syncForm(); edited(true); status('file-status', 'Однотонный фон удалён локально. Результат можно отменить.');
    }
  };
  initialize();
})();
