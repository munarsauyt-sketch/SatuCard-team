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
    let knownUserId;
    window.SATUCARD_AUTH?.getSession().then(session => { if (knownUserId === undefined) knownUserId = session?.user?.id || null; });
    const message = (id, text, error = false) => { $(id).textContent = text; $(id).classList.toggle('error', error); };
    const setBusy = value => { cloudBusy = value; ['cloud-save', 'cloud-copy', 'cloud-refresh'].forEach(id => { $(id).disabled = value; }); };
    const safeName = value => String(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 60) || 'Карточка';
    function renderViews() {
      const { model } = editor.snapshot();
      $('product-views').replaceChildren();
      for (const view of model.views) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = view.label;
        button.setAttribute('aria-pressed', String(view.id === model.activeViewId));
        button.addEventListener('click', () => editor.selectView(view.id)); $('product-views').append(button);
      }
      $('view-label').value = model.views.find(view => view.id === model.activeViewId).label;
      $('remove-view').disabled = model.views.length <= 1; $('add-view').disabled = model.views.length >= 8; $('make-set').disabled = model.views.length > 6;
      $('remove-background').disabled = removing || !model.photoId;
      if (cloudIdentity) message('cloud-status', `Открыт «${cloudIdentity.title}». Изменения сохраняются в облако только по кнопке.`);
      if ($('preflight-results').children.length) message('preflight-status', 'Карточка изменилась. Повторите проверку перед экспортом.');
    }
    document.addEventListener('satucard:editor-change', renderViews);
    renderViews();
    ['cloud-save', 'cloud-copy', 'cloud-refresh', 'copy-offline', 'download-set', 'check-export'].forEach(id => { $(id).disabled = false; });
    const actOnSet = action => { try { action(); message('set-status', 'Изменение комплекта можно отменить. Тексты и оформление каждой карточки редактируются отдельно.'); } catch (error) { message('set-status', error.message, true); } };
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
      if (knownUserId !== undefined && userId !== knownUserId) { detachCloud(); $('cloud-project-list').replaceChildren(); copyInputVersion++; copyDraft = null; $('copy-result').hidden = true; }
      knownUserId = userId;
    });

    async function makeCopy(ai) {
      if (copyBusy) return;
      const snapshot = editor.snapshot(), revision = editor.revision, inputVersion = copyInputVersion;
      const input = { language: $('copy-language').value, tone: $('copy-tone').value, title: snapshot.model.settings.title, facts: $('copy-facts').value };
      copyBusy = true; $('copy-offline').disabled = true; $('copy-ai').disabled = true; $('copy-result').hidden = true; copyDraft = null;
      message('copy-status', ai ? 'Готовим ИИ-черновик…' : 'Собираем текст из ваших фактов…');
      let timer;
      try {
        window.SATUCARD_COPY.validate(input);
        let draft;
        if (ai) {
          const session = await window.SATUCARD_AUTH?.getSession(); if (!session) throw new Error('Для ИИ войдите в аккаунт и завершите профиль. Шаблон доступен без входа.');
          const controller = new AbortController(); timer = setTimeout(() => controller.abort(), 22000);
          const response = await fetch('api/copy', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' }, signal: controller.signal, body: JSON.stringify(input) });
          draft = await response.json(); if (!response.ok) throw new Error(draft.error || 'ИИ недоступен. Попробуйте создать шаблон.');
        } else draft = window.SATUCARD_COPY.offline(input);
        if (inputVersion !== copyInputVersion) { message('copy-status', 'Исходные данные изменились. Создайте подсказку заново.'); return; }
        copyDraft = draft; copyRevision = revision;
        $('copy-preview').textContent = [draft.title, draft.subtitle, draft.description, ...draft.features.map(text => '• ' + text)].filter(Boolean).join('\n\n');
        $('copy-result').hidden = false;
        message('copy-status', ai ? 'ИИ-черновик: проверьте перевод и каждый факт. Применение заменит тексты только выбранной карточки.' : 'Шаблон без ИИ. Факты сохранены на исходном языке; длинные факты могли не поместиться. Проверьте текст.');
      } catch (error) { message('copy-status', error.name === 'AbortError' ? 'ИИ не ответил вовремя. Можно использовать шаблон.' : error.message, true); }
      finally { clearTimeout(timer); copyBusy = false; $('copy-offline').disabled = false; $('copy-ai').disabled = !aiAvailable; }
    }
    ['copy-language', 'copy-tone', 'copy-facts'].forEach(id => $(id).addEventListener('input', () => { copyInputVersion++; copyDraft = null; $('copy-result').hidden = true; message('copy-status', 'Данные изменены. Создайте новую подсказку.'); }));
    $('copy-offline').addEventListener('click', () => makeCopy(false)); $('copy-ai').addEventListener('click', () => makeCopy(true));
    $('copy-apply').addEventListener('click', () => { if (!copyDraft) return; try { editor.applyCopy(copyDraft, copyRevision); $('copy-result').hidden = true; copyDraft = null; message('copy-status', 'Тексты применены. Можно отменить кнопкой ↶.'); } catch (error) { message('copy-status', error.message, true); } });
    $('copy-dismiss').addEventListener('click', () => { copyDraft = null; $('copy-result').hidden = true; });
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
          const { surface, blob } = await renderFile(view.settings, snapshot.images, jpeg, scale);
          const name = `${String(index + 1).padStart(2, '0')}-${safeName(view.label)}.${jpeg ? 'jpg' : 'png'}`;
          files.push({ name, bytes: new Uint8Array(await blob.arrayBuffer()) });
          reports.push({ file: name, report: getReport(view.settings, snapshot.images, surface, blob, marketplace) });
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
