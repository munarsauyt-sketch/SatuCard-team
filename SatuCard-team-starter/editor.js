'use strict';

// Editing is local. Cloud save and AI requests are separate explicit actions.
(() => {
  const $ = id => document.getElementById(id);
  const form = $('editor-form'), renderer = window.SATUCARD_RENDERER, project = window.SATUCARD_PROJECT;
  if (!form || !renderer || !project) return;
  form.inert = true;
  ['download-button', 'copy-card-image', 'publish-button', 'save-project-button', 'load-project-input'].forEach(id => { $(id).disabled = true; });
  const canvas = $('product-canvas'), assets = new Map(), pendingAssets = new Set();
  const miniPreview = $('mini-preview'), miniCanvas = $('mini-preview-canvas'), miniToggle = $('mini-preview-toggle');
  const miniPicture = $('mini-preview-picture');
  const miniResize = $('mini-preview-resize'), miniMove = $('mini-preview-move');
  const miniMobileToggle = $('mini-preview-mobile');
  const miniHeading = miniToggle.closest('.mini-preview-heading');
  const mobileNavigation = document.querySelector('.studio-mobile-view');
  const previewStage = $('preview-stage'), toolbar = document.querySelector('.studio-project-bar');
  const palettes = {
    forest: ['#e1e8d9', '#466343', '#233126'], orange: ['#fff0e5', '#f06435', '#35251f'],
    ocean: ['#dcedf5', '#087da1', '#112c3d'], violet: ['#ece5ff', '#8053df', '#2a2041'], rose: ['#fce5ed', '#c34f7a', '#462232']
  };
  const samples = window.SATUCARD_SAMPLES;
  const textFields = { 'product-name': 'title', 'product-subtitle': 'subtitle', 'product-description': 'description', 'product-badge': 'badge', 'brand-name': 'brandName' };
  const selectFields = { 'card-format': 'format', 'font-family': 'font', 'text-align': 'textAlign', 'card-purpose': 'purpose', 'product-category': 'category' };
  const colorFields = { 'background-color': 'background', 'accent-color': 'accent', 'text-color': 'textColor' };
  const checkFields = { 'show-price': 'showPrice', 'show-brand': 'showBrand', 'custom-colors': 'customColors' };
  const photoRanges = { 'photo-zoom': 'zoom', 'photo-position-x': 'x', 'photo-position-y': 'y', 'photo-rotation': 'rotation', 'photo-brightness': 'brightness', 'photo-contrast': 'contrast', 'photo-saturation': 'saturation', 'photo-warmth': 'warmth', 'photo-blur': 'blur', 'photo-radius': 'radius' };
  const exportFormats = {
    png: { mime: 'image/png', extension: 'png', label: 'PNG' },
    jpeg: { mime: 'image/jpeg', extension: 'jpg', label: 'JPEG' },
    webp: { mime: 'image/webp', extension: 'webp', label: 'WebP' }
  };
  const selectedExportFormat = () => exportFormats[$('export-format').value] || exportFormats.png;
  const copyFields = ['title', 'subtitle', 'description', 'features'];
  let model = { settings: renderer.normalize({ ...samples.headphones, brandName: 'SatuCard.', template: 'neon', format: 'portrait' }), photoId: null, photoIds: [], libraryIds: [], logoId: null, productContextId: 0 };
  let initialModel, history, geometry, dragging, pendingDraft;
  let framePending = false, initialized = false, publishing = false, exporting = false;
  let previewFont;
  let historyTimer, draftTimer, thumbTimer, lastPublished = '';
  let publication = null;
  let photoVersion = 0, logoVersion = 0, projectVersion = 0;
  let draftQueue = Promise.resolve();
  let draftId = crypto.randomUUID(), pendingDraftId = null, draftDirty = false;
  try {
    draftId = new URLSearchParams(location.search).get('draft') || sessionStorage.getItem('satucard-active-draft') || draftId;
    sessionStorage.setItem('satucard-active-draft', draftId);
  } catch (_) { /* IndexedDB still works when session storage is unavailable. */ }
  // A duplicated tab gets its own writer while retaining the recoverable original.
  function claimDraftWriter() {
    if (!navigator.locks) return Promise.resolve();
    return new Promise(ready => navigator.locks.request('satucard-draft-' + draftId, { ifAvailable: true }, async lock => {
      if (!lock) {
        draftId = crypto.randomUUID();
        try { sessionStorage.setItem('satucard-active-draft', draftId); } catch (_) {}
        await claimDraftWriter();
        ready();
        return;
      }
      ready();
      await new Promise(resolve => window.addEventListener('pagehide', resolve, { once: true }));
    }).catch(() => ready()));
  }
  let draftClaim = claimDraftWriter();
  let revision = 0, productContextVersion = 0;
  const activeView = () => model.views.find(view => view.id === model.activeViewId);
  function changeProductContext() { model.productContextId = ++productContextVersion; }
  function syncActiveView() {
    if (!model.views) { model.activeViewId = "main"; model.views = [{ id: "main", label: "Главная", settings: clone(model.settings), sampleKey: 'headphones' }]; }
    const active = activeView();
    if (active) { active.settings = clone(model.settings); active.photoIds = [...model.photoIds]; }
  }
  function notifyChange() { syncActiveView(); revision++; document.dispatchEvent(new Event("satucard:editor-change")); }
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
    if (!price.valid || !old.valid) {
      activateTab('content');
      $(price.valid ? 'old-price' : 'product-price').focus();
      status('download-status', 'Исправьте цену товара.', true);
      return false;
    }
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
    const units = { rotation: '°', radius: ' px', blur: ' px' };
    for (const [id, key] of Object.entries(photoRanges)) $(id + '-value').value = $(id).value + (units[key] || '%');
    $('text-scale-value').value = $('text-scale').value + '%';
    for (const id of Object.keys(colorFields)) $(id).disabled = !$('custom-colors').checked;
    const autoBadge = $('auto-discount-badge');
    if (autoBadge) {
      const p = model.settings.price, oldP = model.settings.oldPrice;
      const pct = p > 0 && oldP > p ? Math.round((1 - p / oldP) * 100) : 0;
      autoBadge.hidden = pct <= 0;
      if (pct > 0) {
        autoBadge.textContent = `−${pct}%`;
        autoBadge.dataset.badgePreset = `−${pct}%`;
      }
    }
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
  function drawMiniPreview() {
    const scale = 720 / Math.max(canvas.width, canvas.height);
    const width = Math.round(canvas.width * scale), height = Math.round(canvas.height * scale);
    if (miniCanvas.width !== width || miniCanvas.height !== height) {
      miniCanvas.width = width;
      miniCanvas.height = height;
      scheduleMiniPreview();
    }
    const context = miniCanvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, width, height);
    context.drawImage(canvas, 0, 0, width, height);
    miniCanvas.setAttribute('aria-label', canvas.getAttribute('aria-label'));
  }
  function updateMiniPreview(redraw = false) {
    if (!geometry) return;
    const bottom = Math.min(canvas.getBoundingClientRect().bottom, previewStage.getBoundingClientRect().bottom);
    const visible = bottom < toolbar.getBoundingClientRect().bottom && focusMode?.getAttribute('aria-pressed') !== 'true';
    const justShown = visible && miniPreview.hidden;
    miniPreview.hidden = !visible;
    miniMobileToggle.hidden = !visible;
    if (visible && !miniPicture.hidden && (redraw || justShown)) drawMiniPreview();
    if (justShown) layoutMiniPreview();
  }
  function renderNow() {
    framePending = false; geometry = renderer.render(canvas, model.settings, imageAssets());
    if (previewFont !== model.settings.font) {
      previewFont = model.settings.font;
      readyFonts(model.settings).then(() => requestRender(true))
        .catch(() => status('project-status', 'Шрифт недоступен. Используется запасной шрифт.', true));
    }
    const size = renderer.formats[model.settings.format];
    $('format-description').textContent = `${size.label} · ${size.width} × ${size.height}`;
    const cardName = model.settings.title ? 'Карточка: ' + model.settings.title : 'Карточка без названия';
    $('preview-caption').textContent = cardName + '. Шаблон ' + renderer.templates[model.settings.template].label + '.';
    canvas.setAttribute('aria-label', $('preview-caption').textContent);
    updateMiniPreview(true);
    $('download-button').querySelector('span').textContent = 'Скачать ' + selectedExportFormat().label;
    document.querySelectorAll('[data-template]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.template === model.settings.template)));
    document.querySelectorAll('[data-sample]').forEach(button => button.setAttribute('aria-pressed', String(model.photoId === 'sample-' + button.dataset.sample)));
    const filters = { original: [100, 100, 100], mono: [100, 110, 0], vivid: [103, 115, 130], soft: [110, 90, 85] };
    const { brightness, contrast, saturation, warmth, blur } = model.settings.photo;
    document.querySelectorAll('[data-photo-filter]').forEach(button => button.setAttribute('aria-pressed',
      String(!warmth && !blur && filters[button.dataset.photoFilter].every((value, index) => value === [brightness, contrast, saturation][index]))));
    document.querySelectorAll('[data-palette]').forEach(button => button.setAttribute('aria-pressed', String(model.settings.customColors && palettes[button.dataset.palette].every((value, index) => value === model.settings[['background', 'accent', 'textColor'][index]]))));
    $('photo-palette').disabled = !model.photoId;
    if ($('fullscreen-dialog').open) renderer.render($('fullscreen-canvas'), model.settings, imageAssets());
    if ($('phone-dialog').open) renderer.render($('phone-canvas'), model.settings, imageAssets());
  }
  function requestRender(thumbs = false) {
    if (!framePending) { framePending = true; requestAnimationFrame(renderNow); }
    if (thumbs) { clearTimeout(thumbTimer); thumbTimer = setTimeout(renderThumbnails, 220); }
  }
  function renderThumbnails() {
    if ($('panel-templates').hidden) return;
    document.querySelectorAll('[data-template]').forEach(button => renderer.render(button.querySelector('canvas'), { ...model.settings, template: button.dataset.template, customColors: false, format: 'portrait' }, imageAssets(), { scale: 0.16 }));
  }
  function buildDesignOptions() {
    $('template-count').textContent = `${Object.keys(renderer.templates).length} стилей`;
    for (const [key, font] of Object.entries(renderer.fonts)) $('font-family').add(new Option(font.label, key));
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
    if (!initialized) return;
    clearTimeout(draftTimer);
    syncActiveView();
    draftDirty = true;
    status('draft-status', 'Сохраняем черновик…');
    try { project.saveJournal?.(draftId, model); } catch (_) { /* Full project is still saved in IndexedDB. */ }
    const savedRevision = revision;
    const savedDraftId = draftId;
    let value;
    try { value = serialized(); }
    catch (_) { status('draft-status', 'Скачайте проект для сохранения.', true); return; }
    draftQueue = draftQueue.catch(() => {}).then(() => project.draftAction('put', value, savedDraftId));
    draftQueue.then(() => {
      if (!form.isConnected || revision !== savedRevision || draftId !== savedDraftId) return;
      draftDirty = false;
      status('draft-status', 'Сохранено на устройстве');
    }, () => { if (form.isConnected) status('draft-status', 'Ошибка сохранения — скачайте проект', true); });
  }
  window.addEventListener('beforeunload', event => {
    if (!draftDirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && draftDirty) saveDraftSoon();
  });
  function decodeImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => image.naturalWidth && image.naturalHeight ? resolve(image) : reject(new Error('Пустое изображение'));
      image.onerror = () => reject(new Error('Не удалось прочитать изображение. Выберите другой файл.')); image.src = source;
    });
  }
  async function registerAsset(source, id = 'asset-' + crypto.randomUUID()) {
    const image = await decodeImage(source);
    let sampleKey = Object.keys(samples).find(key => window.SATUCARD_DEMO_IMAGES?.[key] === source);
    if (!sampleKey && crypto.subtle && source.startsWith('data:image/jpeg;base64,')) {
      const bytes = Uint8Array.from(atob(source.split(',')[1]), char => char.charCodeAt(0));
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      sampleKey = window.SATUCARD_SAMPLE_DIGESTS?.[hex];
    }
    assets.set(id, { image, source, sampleKey }); pendingAssets.add(id); return id;
  }
  function readFile(file) {
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Файл недоступен.')); reader.readAsDataURL(file); });
  }
  async function optimizedImage(file, maxSize) {
    if (window.SATUCARD_PHOTO_IMPORT) file = await window.SATUCARD_PHOTO_IMPORT.convert(file);
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
    if (files.some(file => !(window.SATUCARD_PHOTO_IMPORT?.accepts(file) ?? ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) || file.size > 10 * 1024 * 1024)) { status('file-status', 'Выберите JPG, PNG, WebP или HEIC до 10 МБ каждый.', true); return; }
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
      if (newProduct) {
        activateTab('content');
        $('product-name').focus({ preventScroll: true });
        $('product-name').scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      }
      status('file-status', newProduct
        ? 'Фото загружено. Укажите название и данные своего товара.'
        : 'Добавлено фото: ' + added.length + '. Нажимайте миниатюры, чтобы выбрать до 3 для этой карточки.');
    } catch (error) { added.forEach(id => assets.delete(id)); if (version === photoVersion) status('file-status', error.message, true); }
    finally { added.forEach(id => pendingAssets.delete(id)); releaseUnusedAssets(); }
  }
  async function loadSample(key, initialize = false) {
    if (!Object.hasOwn(samples, key)) return; const version = ++photoVersion; status('file-status', 'Загружаем пример…');
    try {
      const id = 'sample-' + key; if (!assets.has(id)) {
        let source = window.SATUCARD_DEMO_IMAGES?.[key];
        if (!source) {
          const response = await fetch('assets/images/' + key + '.jpg');
          if (!response.ok) throw new Error('Не удалось загрузить пример.');
          source = await readFile(await response.blob());
        }
        await registerAsset(source, id);
        assets.get(id).sampleKey = key;
      }
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
    if (focusMode?.getAttribute('aria-pressed') === 'true') setFocusMode(false);
    document.querySelectorAll('[data-editor-tab]').forEach(button => { const active = button.dataset.editorTab === key; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; button.classList.toggle('is-active', active); if (active && focus) button.focus(); });
    document.querySelectorAll('[data-editor-panel]').forEach(panel => { panel.hidden = panel.dataset.editorPanel !== key; });
    if (key === 'templates') renderThumbnails();
  }
  function applyPreviewZoom() {
    const zoom = Number($('preview-zoom').value);
    $('canvas-frame').style.width = Number($('canvas-frame').dataset.baseWidth) * zoom / 100 + 'px';
    $('preview-zoom-value').value = zoom === 100 ? 'Вписано' : `${zoom}%`;
  }
  function fitPreview(resetZoom = true) {
    const stage = $('preview-stage'), size = renderer.formats[model.settings.format];
    const availableHeight = Math.max(180, stage.clientHeight - 28);
    const width = Math.max(140, Math.min(stage.clientWidth - 28, availableHeight * size.width / size.height));
    $('canvas-frame').dataset.baseWidth = width;
    if (resetZoom) $('preview-zoom').value = '100';
    canvas.style.aspectRatio = `${size.width} / ${size.height}`;
    applyPreviewZoom();
  }
  function blobFromCanvas(surface, type, quality) { return new Promise((resolve, reject) => surface.toBlob(blob => blob ? resolve(blob) : reject(new Error('Браузер не смог подготовить изображение.')), type, quality)); }
  async function readyFonts(settings) {
    if (!document.fonts) return;
    const family = renderer.fonts[settings.font].family;
    const text = [settings.title, settings.subtitle, settings.description, settings.brandName, settings.badge, ...settings.features,
      'Товар / Тауар 0123456789 ₸ ӘҒҚҢӨҰҮҺІ'].join(' ');
    await Promise.all([500, 650, 750, 850].map(weight => document.fonts.load(`${weight} 24px ${family}`, text)));
    await document.fonts.ready;
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function applyPhotoPalette() {
    const photo = imageAssets().photo;
    if (!photo) return;
    try {
      const sample = document.createElement('canvas'); sample.width = sample.height = 32;
      const ctx = sample.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(photo, 0, 0, 32, 32);
      const { data } = ctx.getImageData(0, 0, 32, 32);
      const colors = new Map();
      for (let i = 0; i < data.length; i += 4) {
        const red = data[i], green = data[i + 1], blue = data[i + 2];
        if (data[i + 3] < 128) continue;
        const high = Math.max(red, green, blue), low = Math.min(red, green, blue);
        const bin = (red >> 5) * 64 + (green >> 5) * 8 + (blue >> 5);
        const color = colors.get(bin) || { score: 0, count: 0, red: 0, green: 0, blue: 0 };
        color.score += (1 + (high - low) / 48) * (low > 235 || high < 32 ? 0.3 : 1);
        color.count++; color.red += red; color.green += green; color.blue += blue;
        colors.set(bin, color);
      }
      const best = [...colors.values()].sort((a, b) => b.score - a.score)[0];
      if (!best) throw new Error('Добавьте фото с видимыми цветами.');
      const rgb = [best.red, best.green, best.blue].map(channel => channel / best.count);
      const hex = channels => '#' + channels.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('');
      commit();
      model.settings = renderer.normalize({ ...model.settings, customColors: true,
        background: hex(rgb.map(channel => channel * 0.16 + 255 * 0.84)),
        accent: hex(rgb.map(channel => channel * 0.56)), textColor: '#1c1c27' });
      syncForm(); edited(true);
      status('project-status', 'Цвета взяты из главного фото. Палитру можно отменить.');
    } catch (error) { status('project-status', 'Не удалось подобрать цвета по фото.', true); }
  }
  async function renderExport(settings, images, format, scale) {
    await readyFonts(settings);
    const surface = document.createElement('canvas');
    const layout = renderer.render(surface, settings, images, { scale });
    const blob = await blobFromCanvas(surface, format.mime, 0.95);
    if (format.mime === 'image/webp' && blob.type !== format.mime) throw new Error('Браузер не поддерживает экспорт WebP. Выберите PNG или JPEG.');
    return { surface, layout, blob };
  }
  async function exportImage(copy = false) {
    if (exporting || $('download-button').disabled) return;
    readForm(); commit(); if (!validDetails()) return;
    if (copy && (!navigator.clipboard?.write || typeof window.ClipboardItem !== 'function')) {
      status('download-status', 'Копирование изображений недоступно в этом браузере. Скачайте PNG.', true); return;
    }
    exporting = true;
    $('download-button').disabled = $('copy-card-image').disabled = true;
    const setButton = $('download-set'), setWasDisabled = setButton.disabled;
    setButton.disabled = true;
    status('download-status', 'Подготавливаем изображение…');
    try {
      const view = clone(activeView()), name = filename(), format = copy ? exportFormats.png : selectedExportFormat();
      const photos = imageAssets(), scale = Number($('export-scale').value), marketplace = $('marketplace').value;
      const exportRevision = revision;
      const rendering = renderExport(view.settings, photos, format, scale);
      if (copy) {
        const image = rendering.then(({ blob }) => blob);
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })]); }
        catch { await image.catch(() => {}); throw new Error('Не удалось скопировать карточку. Скачайте её как PNG.'); }
        status('download-status', 'Карточка скопирована в буфер обмена.');
        return;
      }
      const { surface, layout, blob } = await rendering;
      if (exportRevision !== revision || format !== selectedExportFormat() || scale !== Number($('export-scale').value) || marketplace !== $('marketplace').value) {
        status('download-status', 'Карточка или параметры экспорта изменились. Запустите скачивание ещё раз.');
        return;
      }
      const download = () => {
        downloadBlob(blob, `${name}-${renderer.formats[view.settings.format].file}.${format.extension}`);
        const kilobytes = blob.size / 1024;
        const size = kilobytes < 1024
          ? `${Math.ceil(kilobytes)} КБ`
          : `${(kilobytes / 1024).toFixed(1).replace('.', ',')} МБ`;
        status('download-status', `Файл готов: ${surface.width} × ${surface.height}, ${size}. Проверьте загрузки браузера.`);
      };
      const workflow = window.SATUCARD_WORKFLOW;
      if (workflow) {
        const report = workflow.showPreflight(view, photos, surface, blob, layout);
        workflow.reviewDownload([{ view, report }], download);
      } else download();
    } catch (error) { status('download-status', error.message, true); }
    finally {
      exporting = false;
      $('download-button').disabled = $('copy-card-image').disabled = false;
      setButton.disabled = setWasDisabled;
    }
  }
  async function publishCard() {
    if (publishing) return; readForm(); commit(); if (!validDetails(model.settings.showPrice)) return;
    if (location.protocol === 'file:') { status('publish-status', 'Для публикации откройте сайт SatuCard в интернете.', true); return; }
    const contact = $('seller-contact').value.trim();
    if (contact) {
      try { const url = new URL(contact); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); }
      catch (_) { status('publish-status', 'Укажите HTTPS-ссылку на магазин, товар или WhatsApp.', true); $('seller-contact').focus(); return; }
    }
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
      const data = new FormData(); data.set('image', blob, 'card.jpg'); data.set('title', saved.title); data.set('price', saved.price === null ? '' : String(saved.price)); data.set('oldPrice', saved.showPrice ? saved.oldPrice ?? '' : '');
      data.set('showPrice', String(saved.showPrice));
      data.set('showBrand', String(saved.showBrand));
      data.set('contactUrl', $('seller-contact').value.trim());
      if (publication) { data.set('id', publication.id); data.set('expectedImagePath', publication.imagePath); }
      data.set('style', saved.template); data.set('format', saved.format); data.set('brandName', saved.brandName);
      const response = await fetch('api/cards', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: data }), result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось опубликовать карточку.');
      lastPublished = new URL('api/share?id=' + encodeURIComponent(result.id), location.href).href;
      try { localStorage.setItem('satucard-publication-draft-' + result.id, draftId); } catch (_) {}
      if (publication) publication = { ...publication, imagePath: result.imagePath };
      $('published-url').value = lastPublished; $('published-card-link').href = result.url;
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
  form.addEventListener('change', event => { if (event.target.type === 'file' || event.target.closest('[data-workflow-control]')) return; readForm(); commit(); requestRender(true); if (event.target.id === 'card-format') fitPreview(); if (['card-purpose', 'product-category'].includes(event.target.id)) updateContentHints(); });
  form.addEventListener('focusout', commit);
  $('photo-input').addEventListener('change', event => { loadPhotos([...event.target.files]); event.target.value = ''; });
  document.addEventListener('paste', event => {
    if (event.defaultPrevented || !initialized ||
        event.target.closest?.('input,textarea,select,[contenteditable],dialog,#ai-chat')) return;
    const photos = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith('image/'));
    if (!photos.length) return;
    event.preventDefault();
    activateTab('photo');
    loadPhotos(photos);
  });
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
  $('photo-palette').addEventListener('click', applyPhotoPalette);
  document.querySelectorAll('[data-photo-filter]').forEach(button => button.addEventListener('click', () => {
    const filters = { original: [100, 100, 100], mono: [100, 110, 0], vivid: [103, 115, 130], soft: [110, 90, 85] }; commit();
    const [brightness, contrast, saturation] = filters[button.dataset.photoFilter];
    model.settings.photo = { ...model.settings.photo, brightness, contrast, saturation, warmth: 0, blur: 0 }; syncForm(); edited(true);
  }));
  $('reset-photo-button').addEventListener('click', () => { commit(); model.settings.photo = renderer.normalize({}).photo; syncForm(); edited(true); });
  document.querySelectorAll('[data-editor-tab]').forEach(button => {
    button.addEventListener('click', () => activateTab(button.dataset.editorTab));
    button.addEventListener('keydown', event => {
      const keys = [...document.querySelectorAll('[data-editor-tab]')].map(tab => tab.dataset.editorTab);
      const index = keys.indexOf(button.dataset.editorTab);
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length;
        activateTab(keys[next], true);
      }
    });
  });
  $('undo-button').addEventListener('click', () => undoRedo('undo')); $('redo-button').addEventListener('click', () => undoRedo('redo'));
  document.addEventListener('keydown', event => {
    if (event.target.matches('input[type="text"],textarea,[contenteditable="true"]') || !(event.ctrlKey || event.metaKey) || !initialized) return;
    if (['z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); undoRedo(event.shiftKey || event.key.toLowerCase() === 'y' ? 'redo' : 'undo'); }
  });
  $('reset-button').addEventListener('click', () => { if (!initialModel) return; cancelDrag(); commit(); ++photoVersion; ++logoVersion; ++projectVersion; model = clone(initialModel); changeProductContext(); syncForm(); edited(true); fitPreview(); status('file-status', 'Исходный демонстрационный товар. Сброс можно отменить.'); status('brand-logo-status', ''); });
  $('preview-zoom').addEventListener('input', applyPreviewZoom);
  $('preview-fit-button').addEventListener('click', () => fitPreview());
  window.addEventListener('resize', () => fitPreview(false));
  const focusMode = $('canvas-focus-mode');
  let miniPreviewFrame = 0;
  let miniSize, miniPosition;
  const miniCardAspect = () => miniCanvas.width / miniCanvas.height;
  function layoutMiniPreview() {
    if (miniPreview.hidden || !miniPreview.getClientRects().length) return;
    const viewport = document.documentElement;
    const margin = 12;
    const navigation = mobileNavigation.getBoundingClientRect();
    const bottomEdge = navigation.height ? navigation.top - 8 : viewport.clientHeight - margin;
    const topEdge = Math.max(margin, toolbar.getBoundingClientRect().bottom + 8);
    if (!miniPicture.hidden) {
      const maxWidth = Math.max(1, Math.min(viewport.clientWidth - margin * 2, 680));
      const maxHeight = Math.max(1, bottomEdge - topEdge - miniHeading.offsetHeight - 8);
      const defaultWidth = parseFloat(getComputedStyle(miniPreview).getPropertyValue('--mini-default-width'));
      const aspect = miniCardAspect();
      let width = miniSize?.width ?? defaultWidth;
      // Keep the chosen stretch relative to the active card's format.
      let height = (miniSize ? miniSize.height * miniSize.cardAspect : defaultWidth) / aspect;
      if (!miniSize || miniSize.proportional) {
        const minScale = Math.max(174 / width, 96 / height);
        const maxScale = Math.min(maxWidth / width, maxHeight / height);
        const scale = Math.min(maxScale, Math.max(1, minScale));
        width *= scale;
        height *= scale;
      } else {
        width = Math.min(maxWidth, Math.max(174, width));
        height = Math.min(maxHeight, Math.max(96, height));
      }
      miniPicture.style.width = `${Math.max(1, Math.floor(width))}px`;
      miniPicture.style.height = `${Math.max(1, Math.floor(height))}px`;
    }

    const minimumBottom = viewport.clientHeight - bottomEdge;
    const maximumBottom = viewport.clientHeight - topEdge - miniPreview.offsetHeight;
    const maximumRight = viewport.clientWidth - miniPreview.offsetWidth - margin;
    const right = Math.max(margin, Math.min(maximumRight, miniPosition?.right ?? 20));
    const bottom = Math.max(minimumBottom, Math.min(maximumBottom, miniPosition?.bottom ?? 20));
    miniPreview.style.right = `${Math.round(right)}px`;
    miniPreview.style.bottom = `${Math.round(bottom)}px`;
  }
  function miniPreviewBounds() {
    const rect = miniPreview.getBoundingClientRect(), picture = miniPicture.getBoundingClientRect();
    return {
      width: picture.width,
      height: picture.height,
      right: document.documentElement.clientWidth - rect.right,
      bottom: document.documentElement.clientHeight - rect.bottom
    };
  }
  function bindMiniGesture(handle, mode) {
    let start;
    function apply(bounds, x, y) {
      miniPosition = { right: bounds.right, bottom: bounds.bottom };
      if (mode === 'move') {
        miniPosition.right -= x;
        miniPosition.bottom -= y;
      } else {
        let { width, height } = bounds;
        const proportional = mode === 'proportional';
        if (proportional) {
          const horizontal = x / width, vertical = y / height;
          const delta = Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical;
          const scale = Math.max(0.01, 1 - delta);
          width *= scale;
          height *= scale;
        } else if (mode === 'width') {
          width = Math.max(174, width - x);
        } else {
          height = Math.max(96, height - y);
        }
        miniSize = { width, height, proportional, cardAspect: miniCardAspect() };
      }
      layoutMiniPreview();
    }
    handle.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      start = { id: event.pointerId, x: event.clientX, y: event.clientY, bounds: miniPreviewBounds() };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (start?.id === event.pointerId) apply(start.bounds, event.clientX - start.x, event.clientY - start.y);
    });
    handle.addEventListener('lostpointercapture', () => { start = null; });
    handle.addEventListener('keydown', event => {
      const steps = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
      const step = steps[event.key];
      if (!step || (mode === 'width' && !step[0]) || (mode === 'height' && !step[1])) return;
      event.preventDefault();
      apply(miniPreviewBounds(), ...step);
    });
  }
  bindMiniGesture(miniMove, 'move');
  miniPreview.querySelectorAll('[data-mini-resize]').forEach(handle => bindMiniGesture(handle, handle.dataset.miniResize));
  $('mini-preview-reset').addEventListener('click', () => {
    miniSize = miniPosition = undefined;
    layoutMiniPreview();
  });
  function scheduleMiniPreview() {
    if (miniPreviewFrame) return;
    miniPreviewFrame = requestAnimationFrame(() => {
      miniPreviewFrame = 0;
      updateMiniPreview();
      layoutMiniPreview();
    });
  }
  window.addEventListener('scroll', scheduleMiniPreview, { passive: true });
  window.addEventListener('resize', scheduleMiniPreview);
  if (typeof ResizeObserver === 'function') {
    const previewObserver = new ResizeObserver(scheduleMiniPreview);
    [canvas, previewStage, toolbar].forEach(element => previewObserver.observe(element));
  }
  // Fold into the bottom navigation only while that navigation is available.
  const mobilePreview = window.matchMedia?.('(max-width: 760px)');
  function setMiniExpanded(expanded) {
    miniPicture.hidden = miniResize.hidden = !expanded;
    miniToggle.setAttribute('aria-expanded', String(expanded));
    miniMobileToggle.setAttribute('aria-expanded', String(expanded));
    miniToggle.setAttribute('aria-label', expanded ? 'Свернуть мини-превью' : 'Развернуть мини-превью');
    updateMiniPreview(true);
    layoutMiniPreview();
  }
  setMiniExpanded(!mobilePreview?.matches);
  mobilePreview?.addEventListener?.('change', event => setMiniExpanded(!event.matches));
  miniMobileToggle.addEventListener('click', () => setMiniExpanded(miniPicture.hidden));
  miniToggle.addEventListener('click', () => {
    setMiniExpanded(miniPicture.hidden);
    if (miniPicture.hidden && mobilePreview?.matches) miniMobileToggle.focus();
  });
  function setFocusMode(active) {
    focusMode.closest('.studio-layout').classList.toggle('is-canvas-focus', active);
    focusMode.setAttribute('aria-pressed', String(active));
    focusMode.textContent = active ? 'Вернуть инструменты' : 'Фокус';
    fitPreview();
    scheduleMiniPreview();
  }
  if (focusMode) {
    focusMode.addEventListener('click', () => setFocusMode(focusMode.getAttribute('aria-pressed') !== 'true'));
    document.querySelectorAll('a[href="#studio-settings"]').forEach(link => link.addEventListener('click', () => {
      if (focusMode.getAttribute('aria-pressed') === 'true') setFocusMode(false);
    }));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('dialog[open]') &&
          focusMode.getAttribute('aria-pressed') === 'true') setFocusMode(false);
    });
  }
  $('crop-photo').addEventListener('click', () => {
    const active = $('crop-photo').getAttribute('aria-pressed') !== 'true';
    $('crop-photo').setAttribute('aria-pressed', String(active));
    canvas.classList.toggle('crop-mode', active);
    status('project-status', active ? 'Перетащите фото. Нажмите «Кадрировать» ещё раз, чтобы вернуться к прокрутке.' : '');
  });
  $('upload-own-photo').addEventListener('click', () => $('photo-input').click());
  $('quick-purpose').addEventListener('change', event => {
    const presets = { catalog: ['square', 'cover'], marketplace: ['portrait34', 'cover'], post: ['portrait', 'cover'], story: ['story', 'cover'], advantages: ['portrait', 'advantages'] };
    const preset = presets[event.target.value];
    if (!preset) return;
    commit();
    [model.settings.format, model.settings.purpose] = preset;
    syncForm(); edited(true); fitPreview();
    status('project-status', 'Формат выбран. Добавьте фото и данные товара.');
  });
  document.querySelectorAll('[data-badge-preset]').forEach(button => {
    button.addEventListener('click', () => {
      const badgeInput = $('product-badge');
      if (!badgeInput) return;
      commit();
      badgeInput.value = button.dataset.badgePreset || '';
      badgeInput.dispatchEvent(new Event('input', { bubbles: true }));
      badgeInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  const safeZoneToggle = $('safe-zone-toggle');
  const safeZoneOverlay = $('safe-zone-overlay');
  function updateSafeZone() {
    if (!safeZoneToggle || !safeZoneOverlay) return;
    const active = safeZoneToggle.getAttribute('aria-pressed') === 'true';
    safeZoneOverlay.hidden = !active;
    if (!active) return;
    const toolsApi = window.SATUCARD_TOOLS;
    const rect = toolsApi?.getSafeZoneRect?.(model.settings.format, $('marketplace')?.value)
      || { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08, label: 'Безопасная зона' };
    safeZoneOverlay.style.top = (rect.top * 100) + '%';
    safeZoneOverlay.style.right = (rect.right * 100) + '%';
    safeZoneOverlay.style.bottom = (rect.bottom * 100) + '%';
    safeZoneOverlay.style.left = (rect.left * 100) + '%';
    const labelEl = safeZoneOverlay.querySelector('.safe-zone-label');
    if (labelEl) labelEl.textContent = rect.label;
  }
  safeZoneToggle?.addEventListener('click', () => {
    const next = safeZoneToggle.getAttribute('aria-pressed') !== 'true';
    safeZoneToggle.setAttribute('aria-pressed', String(next));
    updateSafeZone();
  });
  $('card-format')?.addEventListener('change', updateSafeZone);
  $('marketplace')?.addEventListener('change', updateSafeZone);
  $('card-text-preview').addEventListener('click', () => {
    const result = $('card-text-content');
    result.replaceChildren();
    const settings = model.settings;
    const lines = [settings.showBrand ? settings.brandName : '', settings.title, settings.subtitle, settings.description, ...settings.features,
      settings.showPrice ? (settings.price === null ? 'Цена по запросу' : new Intl.NumberFormat('ru-RU').format(settings.price) + ' ₸') : ''];
    for (const value of lines.filter(Boolean)) { const p = document.createElement('p'); p.textContent = value; result.append(p); }
    $('card-text-dialog').showModal();
  });
  $('card-edit-text').addEventListener('click', () => {
    $('card-text-dialog').close();
    activateTab('content');
    $('product-name').focus();
    $('product-name').scrollIntoView({ block: 'center' });
  });
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && $('crop-photo')?.getAttribute('aria-pressed') !== 'true') return;
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
  $('download-button').addEventListener('click', () => exportImage());
  $('make-video-button')?.addEventListener('click',async()=>{
    try{readForm();saveDraftSoon();await draftQueue;if(draftDirty)throw new Error('Сначала сохраните карточку.');location.href='video.html?fromCard='+encodeURIComponent(draftId);}
    catch(error){status('download-status',error.message,true);}
  });
  $('copy-card-image').addEventListener('click', () => exportImage(true));
  $('publish-button').addEventListener('click', publishCard); $('export-format').addEventListener('change', () => requestRender());
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
  $('restore-draft-button').addEventListener('click', async () => {
    try {
      if (!pendingDraft) return;
      await restoreProject(pendingDraft);
      pendingDraft = null;
      $('draft-restore-banner').hidden = true;
      status('project-status', 'Черновик восстановлен вместе с фотографиями.');
    } catch (error) { status('project-status', error.message, true); }
  });
  $('discard-draft-button').addEventListener('click', () => {
    pendingDraft = null;
    $('draft-restore-banner').hidden = true;
    draftId = crypto.randomUUID();
    draftClaim = claimDraftWriter();
    try { sessionStorage.setItem('satucard-active-draft', draftId); } catch (_) {}
    status('draft-status', 'Новый товар · предыдущие проекты в списке');
  });
  document.querySelectorAll('a[href="auth.html"]').forEach(link => link.addEventListener('click', () => {
    saveDraftSoon();
    try {
      const returnUrl = new URL(location.href);
      returnUrl.searchParams.set('draft', draftId);
      const flow = JSON.stringify({ path: returnUrl.pathname + returnUrl.search, createdAt: Date.now() });
      sessionStorage.setItem('satucard-editor-return', flow);
      localStorage.setItem('satucard-editor-return', flow);
    } catch (_) {}
  }));
  async function updateAuth() { const session = Boolean(await window.SATUCARD_AUTH?.getSession()); $('publish-login').hidden = session; if ($('publish-login-note')) $('publish-login-note').hidden = session; }
  document.addEventListener('satucard:authchange', updateAuth); updateAuth();
  async function initialize() {
    await draftClaim;
    buildDesignOptions(); activateTab('photo'); syncForm(); fitPreview(); const params = new URLSearchParams(location.search);
    document.querySelectorAll('[data-palette]').forEach(button => { const chip = button.querySelector('i'); palettes[button.dataset.palette].forEach((color, index) => chip.style.setProperty('--palette-' + ['a', 'b', 'c'][index], color)); });
    if (renderer.templates[params.get('style')]) model.settings.template = params.get('style'); if (renderer.formats[params.get('format')]) model.settings.format = params.get('format');
    await loadSample(Object.hasOwn(samples, params.get('photo')) ? params.get('photo') : 'headphones', true);
    if (!initialized) { syncActiveView(); initialModel = clone(model); history = project.createHistory(model); initialized = true; updateHistory(); requestRender(true); }
    form.inert = false;
    ['download-button', 'copy-card-image', 'publish-button', 'save-project-button', 'load-project-input'].forEach(id => { $(id).disabled = false; });
    fitPreview();
    try {
      const requestedDraft = params.get('draft');
      const own = await project.draftAction('get', undefined, requestedDraft || draftId);
      const drafts = own ? [] : await project.draftAction('list');
      const latest = drafts?.filter?.(entry => entry?.payload).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      pendingDraftId = requestedDraft || (own ? draftId : latest?.id || 'current');
      let saved = own || latest?.payload || await project.draftAction('get');
      if (saved) {
        saved = project.recoverJournal?.(pendingDraftId, saved) || saved;
        const parsed = project.parseProject(saved, renderer.normalize);
        pendingDraft = saved;
        $('draft-restore-banner').querySelector('p').textContent = 'Продолжить «' + (parsed.settings.title || 'Без названия') + '». Другие товары доступны в списке проектов.';
        $('draft-restore-banner').hidden = false;
        status('draft-status', 'Есть сохранённый черновик');
        if (requestedDraft) $('restore-draft-button').click();
      } else status('draft-status', 'Локальное автосохранение');
    }
    catch (_) { status('draft-status', 'Автосохранение недоступно — используйте «Сохранить проект».'); }
    const publicationId = params.get('publication');
    if (publicationId) {
      try {
        const session = await window.SATUCARD_AUTH?.getSession();
        if (!session) throw new Error('Войдите, чтобы обновить опубликованную карточку.');
        const response = await fetch('api/cards?id=' + encodeURIComponent(publicationId), { headers: { Authorization: 'Bearer ' + session.access_token }, cache: 'no-store' });
        if (!response.ok) throw new Error('Не удалось открыть публикацию. Обновите кабинет.');
        publication = (await response.json()).card;
        $('seller-contact').value = publication.contactUrl;
        $('publish-button').textContent = 'Обновить прежнюю ссылку';
        status('project-status', 'Откройте исходный черновик или файл проекта, проверьте карточку и обновите прежнюю ссылку.');
      } catch (error) {
        $('publish-button').disabled = true;
        status('project-status', error.message, true);
      }
    }
    form.dataset.editorReady = 'true';
    document.dispatchEvent(new Event('satucard:editor-ready'));
    document.fonts?.ready.then(() => requestRender(true));
  }
  // Small integration surface shared by the workflow UI; model changes remain undoable.
  window.SATUCARD_EDITOR = {
    get revision() { return revision; },
    brandProfile() {
      const keys = ['brandName', 'showBrand', 'customColors', 'background', 'accent', 'textColor', 'font'];
      return { settings: Object.fromEntries(keys.map(key => [key, model.settings[key]])), logo: assets.get(model.logoId)?.source || null };
    },
    async applyBrandProfile(value) {
      const parsed = project.parseProject(JSON.stringify({ app: 'SatuCard', schemaVersion: 1, settings: value.settings, photo: null, logo: value.logo }), renderer.normalize);
      const started = revision;
      const id = parsed.logo ? await registerAsset(parsed.logo) : null;
      if (revision !== started) {
        if (id) { pendingAssets.delete(id); assets.delete(id); }
        throw new Error('Карточка изменилась. Примените стиль магазина ещё раз.');
      }
      commit();
      const keys = ['brandName', 'showBrand', 'customColors', 'background', 'accent', 'textColor', 'font'];
      for (const key of keys) model.settings[key] = parsed.settings[key];
      model.logoId = id;
      if (id) pendingAssets.delete(id);
      syncForm(); edited(true);
    },
    snapshot(includeProject = false) {
      const sampleKey = activeView().sampleKey || null;
      return { model: clone(model), productContextId: model.productContextId, sampleKey,
        productSettings: clone(withoutSampleSettings(model.settings, sampleKey)),
        productImages: imageAssets({ photoIds: model.photoIds.filter(id => !demoPhoto(id)) }),
        images: imageAssets(), viewImages: Object.fromEntries(model.views.map(view => [view.id, imageAssets(view)])),
        ...(includeProject ? { serialized: serialized() } : {}), filename: filename() };
    },
    selectedExportFormat, renderExport, downloadBlob, restoreProject,
    selectView(id) {
      cancelDrag(); ++photoVersion; readForm(); commit(); const view = model.views.find(item => item.id === id); if (!view) return;
      model.activeViewId = id; model.settings = clone(view.settings); setPhotoIds(view.photoIds); syncForm(); edited(true); fitPreview();
    },
    addView(format) {
      readForm(); commit(); if (model.views.length >= 8) throw new Error('В комплекте не больше 8 карточек.');
      if (format && !Object.hasOwn(renderer.formats, format)) throw new Error('Выберите формат карточки.');
      const id = crypto.randomUUID(), settings = clone(model.settings);
      let label = 'Карточка ' + (model.views.length + 1);
      if (format) {
        const suffix = ' · ' + renderer.formats[format].file.replace('x', ':');
        label = activeView().label.slice(0, 60 - suffix.length) + suffix;
        settings.format = format;
      }
      model.views.push({ id, label, settings, photoIds: [...model.photoIds], sampleKey: activeView().sampleKey });
      model.activeViewId = id; model.settings = settings; syncForm(); edited(true);
      if (format) fitPreview();
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
