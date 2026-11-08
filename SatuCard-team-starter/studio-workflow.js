'use strict';

(() => {
  const $ = id => document.getElementById(id);
  let initialized = false;
  function start() {
    if (initialized) return; initialized = true;
    const editor = window.SATUCARD_EDITOR, renderer = window.SATUCARD_RENDERER, tools = window.SATUCARD_TOOLS;
    if (!editor || !tools || !window.SATUCARD_COPY || !window.SATUCARD_CLOUD) return;
    let cloudIdentity = null, cloudBusy = false, cloudGeneration = 0, copyDraft = null, copyRevision = -1, copyBusy = false, aiAvailable = false;
    let exportingSet = false, checking = false, removing = false, copyInputVersion = 0;
    let copyController = null;
    let knownUserId;
    window.SATUCARD_AUTH?.getSession().then(session => { if (knownUserId === undefined) knownUserId = session?.user?.id || null; });
    const message = (id, text, error = false) => { $(id).textContent = text; $(id).classList.toggle('error', error); };
    const setBusy = value => { cloudBusy = value; ['cloud-save', 'cloud-copy', 'cloud-refresh'].forEach(id => { $(id).disabled = value; }); };
    const safeName = value => String(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 60) || 'Карточка';
    function renderViews() {
      const { model, viewImages } = editor.snapshot();
      $('product-views').replaceChildren();
      for (const view of model.views) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'view-thumbnail';
        const preview = document.createElement('canvas'), label = document.createElement('span'); preview.setAttribute('aria-hidden', 'true'); label.textContent = `${model.views.indexOf(view) + 1}. ${view.label}`;
        renderer.render(preview, view.settings, viewImages[view.id], { scale: 0.12 }); button.append(preview, label);
        button.setAttribute('aria-label', `${view.label}. ${renderer.purposes[view.settings.purpose || 'cover'].label}`);
        button.setAttribute('aria-pressed', String(view.id === model.activeViewId));
        button.addEventListener('click', () => editor.selectView(view.id)); $('product-views').append(button);
      }
      if (document.activeElement !== $('view-label')) $('view-label').value = model.views.find(view => view.id === model.activeViewId).label;
      $('remove-view').disabled = model.views.length <= 1; $('add-view').disabled = model.views.length >= 8; $('make-set').disabled = model.views.length > 6;
      $('remove-background').disabled = removing || !model.photoId;
      const index = model.views.findIndex(view => view.id === model.activeViewId); $('view-earlier').disabled = index === 0; $('view-later').disabled = index === model.views.length - 1;
      if (cloudIdentity) message('cloud-status', `Открыт «${cloudIdentity.title}». Изменения сохраняются в облако только по кнопке.`);
      if ($('preflight-results').children.length) message('preflight-status', 'Карточка изменилась. Повторите проверку перед экспортом.');
    }
    document.addEventListener('satucard:editor-change', renderViews);
    renderViews();
    ['cloud-save', 'cloud-copy', 'cloud-refresh', 'copy-offline', 'download-set', 'check-export'].forEach(id => { $(id).disabled = false; });
    const actOnSet = action => { try { action(); message('set-status', 'Изменение комплекта можно отменить. Тексты и оформление каждой карточки редактируются отдельно.'); } catch (error) { message('set-status', error.message, true); } };
    $('view-earlier').addEventListener('click', () => actOnSet(() => editor.moveView(-1)));
    $('view-later').addEventListener('click', () => actOnSet(() => editor.moveView(1)));
    $('apply-brand').addEventListener('click', () => actOnSet(() => editor.applyBrand()));
    $('make-set').addEventListener('click', () => actOnSet(() => editor.makeSet()));
    $('add-view').addEventListener('click', () => actOnSet(() => editor.addView()));
    $('remove-view').addEventListener('click', () => actOnSet(() => editor.removeView()));
    $('view-label').addEventListener('change', () => actOnSet(() => editor.renameView($('view-label').value)));

    async function listCloud() {
      if (cloudBusy) return; setBusy(true); const generation = cloudGeneration; message('cloud-status', 'Загружаем проекты…');
      try {
        const { projects } = await window.SATUCARD_CLOUD.list(); if (generation !== cloudGeneration) return;
        $('cloud-project-list').replaceChildren();
        for (const project of projects) {
          const row = document.createElement('li'), label = document.createElement('span'), button = document.createElement('button');
          label.textContent = `${project.title} · ${new Date(project.updatedAt).toLocaleString('ru-RU')}`; button.type = 'button'; button.className = 'studio-small-button'; button.textContent = 'Открыть';
          button.addEventListener('click', () => openCloud(project.id)); row.append(label, button); $('cloud-project-list').append(row);
        }
        message('cloud-status', projects.length ? 'Последние 50 проектов. Открытие можно отменить кнопкой ↶ в редакторе.' : 'Облачных проектов пока нет. Сохраните текущий комплект.');
      } catch (error) { message('cloud-status', error.message, true); } finally { setBusy(false); }
    }
    async function openCloud(id) {
      if (cloudBusy) return; setBusy(true); const revision = editor.revision, generation = ++cloudGeneration;
      message('cloud-status', 'Открываем проект…');
      try {
        const { project } = await window.SATUCARD_CLOUD.read(id); if (generation !== cloudGeneration) return;
        await editor.restoreProject(JSON.stringify(project.payload), revision, () => generation !== cloudGeneration);
        if (generation !== cloudGeneration) return;
        cloudIdentity = { id: project.id, version: project.version, title: project.title };
        message('cloud-status', `Открыт «${project.title}». Дальнейшие изменения сохраняйте кнопкой «Сохранить в облаке».`);
      } catch (error) { message('cloud-status', error.message, true); } finally { setBusy(false); }
    }
    async function saveCloud(asCopy) {
      if (cloudBusy) return; setBusy(true); const generation = cloudGeneration, revision = editor.revision;
      message('cloud-status', 'Сохраняем приватный проект…');
      try {
        const { model, serialized } = editor.snapshot(true);
        const identity = asCopy ? null : cloudIdentity;
        const body = { title: model.settings.title, payload: JSON.parse(serialized), ...(identity ? { id: identity.id, version: identity.version } : {}) };
        if (new Blob([JSON.stringify(body)]).size > 3500000) throw new Error('Для облака проект должен быть меньше 3,5 МБ. Уменьшите фото или скачайте файл проекта, он сохранит всё без потерь.');
        const { project } = await window.SATUCARD_CLOUD.save(body); if (generation !== cloudGeneration) return;
        cloudIdentity = { id: project.id, version: project.version, title: project.title };
        message('cloud-status', revision === editor.revision ? `«${project.title}» сохранён приватно. Можно открыть на другом устройстве в личном кабинете.` : 'Сохранена версия на момент нажатия. Есть новые правки: сохраните ещё раз.');
      } catch (error) {
        message('cloud-status', error.code === 'version_conflict' ? 'Проект изменён на другом устройстве. Ваши правки здесь сохранены. Скачайте локальный файл или «Сохранить новую копию», затем откройте свежую версию из списка.' : error.message, true);
      } finally { setBusy(false); }
    }
    $('cloud-save').addEventListener('click', () => saveCloud(false)); $('cloud-copy').addEventListener('click', () => saveCloud(true)); $('cloud-refresh').addEventListener('click', listCloud);
    const detachCloud = () => { cloudIdentity = null; cloudGeneration++; message('cloud-status', 'Этот локальный проект будет сохранён в облаке как новый.'); };
    // Import/reset must never silently replace a previously opened cloud project.
    ['load-project-input', 'reset-button', 'restore-draft-button'].forEach(id => $(id).addEventListener(id === 'load-project-input' ? 'change' : 'click', detachCloud));
    document.addEventListener('satucard:history-navigation', detachCloud);
    document.addEventListener('satucard:authchange', event => {
      const userId = event.detail?.user?.id || null;
      if (knownUserId !== undefined && userId !== knownUserId) { detachCloud(); $('cloud-project-list').replaceChildren(); invalidateCopy('Аккаунт изменился. Создайте подсказку заново.'); }
      knownUserId = userId;
    });

    function invalidateCopy(text) {
      copyInputVersion++; copyController?.abort(); copyController = null; copyBusy = false; copyDraft = null;
      $('copy-result').hidden = true; $('copy-reviewed').checked = false; $('copy-cancel').hidden = true;
      $('copy-offline').disabled = false; $('copy-ai').disabled = !aiAvailable;
      if (text) message('copy-status', text);
    }
    function photoForAI(photo) {
      if (!photo || !photo.naturalWidth || !photo.naturalHeight) throw new Error('Добавьте основное фото или снимите разрешение на его отправку.');
      const scale = Math.min(1, 768 / photo.naturalWidth, 768 / photo.naturalHeight);
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', 0.8);
      if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > 750000) throw new Error('Не удалось подготовить небольшое JPEG-фото. Отключите отправку фото и попробуйте снова.');
      return data;
    }
    for (const [id, template] of Object.entries(renderer.templates)) { const option = document.createElement('option'); option.value = id; option.textContent = template.label; $('copy-template').append(option); }
    function previewTemplate() {
      if (!copyDraft) return;
      const snapshot = editor.snapshot(), template = $('copy-template').value;
      renderer.render($('copy-template-preview'), { ...snapshot.model.settings, title: $('copy-edit-title').value, subtitle: $('copy-edit-subtitle').value, description: $('copy-edit-description').value, features: [1, 2, 3].map(index => $('copy-edit-feature-' + index).value), template, customColors: !$('copy-template-colors').checked }, snapshot.images, { scale: 0.2 });
    }
    async function makeCopy(ai) {
      if (copyBusy) return;
      invalidateCopy();
      const snapshot = editor.snapshot(), revision = editor.revision, inputVersion = copyInputVersion;
      const current = () => inputVersion === copyInputVersion && revision === editor.revision;
      const input = { language: $('copy-language').value, tone: $('copy-tone').value, title: snapshot.model.settings.title, facts: $('copy-facts').value };
      copyBusy = true; $('copy-offline').disabled = true; $('copy-ai').disabled = true; $('copy-cancel').hidden = !ai;
      message('copy-status', ai ? 'ИИ готовит черновик…' : 'Собираем текст из ваших фактов…');
      let timer;
      try {
        window.SATUCARD_COPY.validate(input);
        let draft;
        if (ai) {
          const controller = new AbortController(); copyController = controller; timer = setTimeout(() => controller.abort(), 35000);
          if ($('copy-photo').checked) input.imageDataUrl = photoForAI(snapshot.images.photo);
          const session = await window.SATUCARD_AUTH?.getSession();
          if (!current()) return;
          if (!session) throw new Error('Для ИИ войдите в аккаунт и завершите профиль. Шаблон доступен без входа.');
          const response = await fetch('api/copy', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' }, signal: controller.signal, body: JSON.stringify(input) });
          draft = await response.json(); if (!response.ok) throw new Error(draft.error || 'ИИ недоступен. Попробуйте создать шаблон.');
          if (!draft || !['title', 'subtitle', 'description'].every(key => typeof draft[key] === 'string') || !Array.isArray(draft.features) || !draft.features.every(value => typeof value === 'string') || !Object.hasOwn(renderer.templates, draft.template)) throw new Error('Некорректный ответ ИИ. Попробуйте ещё раз или создайте локальный шаблон.');
          draft.source = 'ai';
        } else draft = window.SATUCARD_COPY.offline(input);
        if (!current()) return;
        copyDraft = draft; copyRevision = revision;
        $('copy-preview').textContent = [draft.title, draft.subtitle, draft.description, ...draft.features.map(text => '• ' + text)].filter(Boolean).join('\n\n');
        ['title', 'subtitle', 'description'].forEach(key => { $('copy-edit-' + key).value = draft[key]; });
        [1, 2, 3].forEach(index => { $('copy-edit-feature-' + index).value = draft.features[index - 1] || ''; });
        $('copy-ai-options').hidden = !ai; $('copy-reviewed').checked = false; $('copy-apply-template').checked = false; $('copy-template-colors').checked = false;
        $('copy-apply').disabled = ai;
        if (ai) { $('copy-template').value = draft.template; $('copy-template-suggestion').textContent = 'Рекомендация ИИ: ' + renderer.templates[draft.template].label + '. Оформление изменится только с вашим разрешением.'; previewTemplate(); }
        $('copy-result').hidden = false;
        message('copy-status', ai ? 'ИИ-черновик: проверьте перевод и каждый факт. Применение заменит тексты только выбранной карточки, без публикации.' : 'Шаблон без ИИ. Факты сохранены на исходном языке; длинные факты могли не поместиться. Проверьте текст.');
      } catch (error) { if (current()) message('copy-status', error.name === 'AbortError' ? 'ИИ не ответил вовремя. Можно использовать шаблон.' : error.message, true); }
      finally { clearTimeout(timer); if (inputVersion === copyInputVersion) { copyController = null; copyBusy = false; $('copy-cancel').hidden = true; $('copy-offline').disabled = false; $('copy-ai').disabled = !aiAvailable; } }
    }
    ['copy-language', 'copy-tone', 'copy-facts', 'copy-photo'].forEach(id => $(id).addEventListener('input', () => invalidateCopy('Данные изменены. Создайте новую подсказку.')));
    document.addEventListener('satucard:editor-change', () => { if (copyBusy || copyDraft) invalidateCopy('Карточка изменилась. Создайте подсказку заново.'); });
    $('photo-input').addEventListener('change', () => invalidateCopy('Фото изменилось. Создайте подсказку заново.'));
    window.addEventListener('pagehide', () => invalidateCopy());
    $('copy-facts').closest('details').addEventListener('toggle', event => { if (!event.currentTarget.open && (copyBusy || copyDraft)) invalidateCopy('Помощник закрыт.'); });
    $('copy-cancel').addEventListener('click', () => invalidateCopy('Ожидание отменено. Уже отправленный запрос может учитываться в лимите.'));
    $('copy-result').addEventListener('input', event => {
      if (event.target.id !== 'copy-reviewed') $('copy-reviewed').checked = false;
      $('copy-apply').disabled = copyDraft?.source === 'ai' && !$('copy-reviewed').checked;
      if (copyDraft?.source === 'ai' && event.target.id !== 'copy-reviewed') previewTemplate();
    });
    $('copy-offline').addEventListener('click', () => makeCopy(false)); $('copy-ai').addEventListener('click', () => makeCopy(true));
    $('copy-apply').addEventListener('click', () => {
      if (!copyDraft || (copyDraft.source === 'ai' && !$('copy-reviewed').checked)) return;
      try {
        const draft = { ...copyDraft, title: $('copy-edit-title').value.trim(), subtitle: $('copy-edit-subtitle').value, description: $('copy-edit-description').value, features: [1, 2, 3].map(index => $('copy-edit-feature-' + index).value) };
        if (!draft.title) throw new Error('Введите название перед применением.');
        const options = draft.source === 'ai' && $('copy-apply-template').checked ? { template: $('copy-template').value, replaceColors: $('copy-template-colors').checked } : {};
        editor.applyCopy(draft, copyRevision, options); invalidateCopy(); message('copy-status', 'Тексты' + (options.template ? ' и шаблон' : '') + ' применены. Можно отменить одним нажатием ↶.');
      } catch (error) { message('copy-status', error.message, true); }
    });
    $('copy-dismiss').addEventListener('click', () => invalidateCopy('Черновик закрыт.'));
    if (location.protocol !== 'file:') fetch('api/copy', { cache: 'no-store', ...(typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(8000) } : {}) }).then(response => response.ok ? response.json() : {}).then(result => {
      aiAvailable = result.available === true; $('copy-ai').disabled = copyBusy || !aiAvailable;
      if (!copyBusy && !copyDraft) message('copy-status', aiAvailable ? 'ИИ доступен подключённым аккаунтам. Шаблон работает локально.' : 'ИИ пока не подключён владельцем сайта. Шаблон работает без ключей и сети.');
    }).catch(() => { if (!copyBusy && !copyDraft) message('copy-status', 'ИИ недоступен. Шаблон работает без сети.'); });
    else message('copy-status', 'Локальный режим: доступен шаблон. ИИ требует сервер и ключ владельца сайта.');

    $('background-tolerance').addEventListener('input', () => { $('background-tolerance-value').value = $('background-tolerance').value; });
    $('remove-background').addEventListener('click', async () => {
      if (removing) return; const snapshot = editor.snapshot(), revision = editor.revision;
      const photo = snapshot.images.photo; if (!photo) return;
      removing = true; $('remove-background').disabled = true; message('background-status', 'Обрабатываем фото на этом устройстве…');
      try {
        await new Promise(resolve => setTimeout(resolve, 30));
        const surface = document.createElement('canvas'); surface.width = photo.naturalWidth; surface.height = photo.naturalHeight;
        const ctx = surface.getContext('2d', { willReadFrequently: true }); ctx.drawImage(photo, 0, 0);
        const pixels = ctx.getImageData(0, 0, surface.width, surface.height);
        const result = tools.removeBackground(pixels, surface.width, surface.height, Number($('background-tolerance').value));
        pixels.data.set(result.data); ctx.putImageData(pixels, 0, 0);
        await editor.replacePhoto(surface.toDataURL('image/png'), revision);
        message('background-status', result.warning || 'Готово. Проверьте края объекта. Для возврата исходного фото нажмите ↶.');
      } catch (error) { message('background-status', error.message, true); }
      finally { removing = false; $('remove-background').disabled = !editor.snapshot().model.photoId; }
    });

    function getReport(settings, images, surface, blob, marketplace = $('marketplace').value) {
      return tools.preflight(settings, { width: surface.width, height: surface.height, bytes: blob.size, mime: blob.type,
        photoWidth: images.photo?.naturalWidth, photoHeight: images.photo?.naturalHeight, hasPhoto: Boolean(images.photo), hasLogo: Boolean(images.logo) }, marketplace);
    }
    function showPreflight(settings, images, surface, blob) {
      const report = getReport(settings, images, surface, blob); $('preflight-results').replaceChildren();
      for (const check of report.checks) { const li = document.createElement('li'); li.dataset.severity = check.severity; li.textContent = ({ pass: '✓ ', warning: 'Внимание: ', error: 'Ошибка: ', info: '' })[check.severity] + check.message; $('preflight-results').append(li); }
      message('preflight-status', `${report.label}: ${surface.width} × ${surface.height}, ${(blob.size / 1024 / 1024).toFixed(2)} МБ. ${report.ok ? 'Техническая проверка завершена.' : 'Есть ошибки.'} ${report.disclaimer}`);
      $('preflight-panel').open = true; return report;
    }
    window.SATUCARD_WORKFLOW = { showPreflight };
    async function renderFile(settings, images, jpeg, scale) {
      await editor.readyFonts(settings); const surface = document.createElement('canvas'); renderer.render(surface, settings, images, { scale });
      return { surface, blob: await editor.blobFromCanvas(surface, jpeg ? 'image/jpeg' : 'image/png', 0.95) };
    }
    $('check-export').addEventListener('click', async () => {
      if (checking) return; checking = true; $('check-export').disabled = true;
      const snapshot = editor.snapshot(), revision = editor.revision;
      message('preflight-status', 'Проверяем размер готового файла…');
      try {
        const { surface, blob } = await renderFile(snapshot.model.settings, snapshot.images, $('export-format').value === 'jpeg', Number($('export-scale').value));
        showPreflight(snapshot.model.settings, snapshot.images, surface, blob);
        if (revision !== editor.revision) message('preflight-status', 'Проверена предыдущая версия. Карточка изменилась: повторите проверку.');
      } catch (error) { message('preflight-status', error.message, true); } finally { checking = false; $('check-export').disabled = false; }
    });
    ['export-format', 'export-scale', 'marketplace'].forEach(id => $(id).addEventListener('change', () => { if ($('preflight-results').children.length) message('preflight-status', 'Параметры экспорта изменились. Повторите проверку.'); }));
    $('download-set').addEventListener('click', async () => {
      if (exportingSet) return; exportingSet = true; $('download-set').disabled = true;
      const snapshot = editor.snapshot(), jpeg = $('export-format').value === 'jpeg', scale = Number($('export-scale').value), marketplace = $('marketplace').value;
      try {
        const files = [], reports = [];
        for (const [index, view] of snapshot.model.views.entries()) {
          message('set-status', `Готовим ${index + 1} из ${snapshot.model.views.length}: ${view.label}…`);
          const { surface, blob } = await renderFile(view.settings, snapshot.viewImages[view.id], jpeg, scale);
          const name = `${String(index + 1).padStart(2, '0')}-${safeName(view.label)}.${jpeg ? 'jpg' : 'png'}`;
          files.push({ name, bytes: new Uint8Array(await blob.arrayBuffer()) });
          reports.push({ file: name, report: getReport(view.settings, snapshot.viewImages[view.id], surface, blob, marketplace) });
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        const reportText = 'SatuCard: проверка комплекта\nНе гарантия приёма площадкой. Проверьте актуальные правила категории.\n\n' + reports.map(({ file, report }) => file + '\n' + report.checks.map(check => `[${check.severity}] ${check.message}`).join('\n')).join('\n\n');
        files.push({ name: 'Проверка.txt', bytes: new TextEncoder().encode(reportText) });
        editor.downloadBlob(new Blob([tools.createZip(files)], { type: 'application/zip' }), snapshot.filename + '-комплект.zip');
        message('set-status', `ZIP готов: ${snapshot.model.views.length} изображений и отчёт «Проверка.txt». Экспортирована версия на момент нажатия. Проверьте предупреждения в отчёте.`);
      } catch (error) { message('set-status', error.message, true); } finally { exportingSet = false; $('download-set').disabled = false; }
    });
    const requested = new URLSearchParams(location.search).get('project');
    if (requested) { document.querySelector('.cloud-panel').open = true; openCloud(requested); }
  }
  document.addEventListener('satucard:editor-ready', start, { once: true });
  if (document.getElementById('editor-form')?.dataset.editorReady === 'true') start();
})();
