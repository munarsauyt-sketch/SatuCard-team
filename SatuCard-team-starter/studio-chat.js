'use strict';

(() => {
  const $ = id => document.getElementById(id);
  let started = false;
  function start() {
    if (started || !window.SATUCARD_EDITOR || !$('ai-chat')) return;
    started = true;
    const editor = window.SATUCARD_EDITOR, renderer = window.SATUCARD_RENDERER;
    let activeProvider = null, singleUserPilot = false, groqAvailable = false;
    let configured = false, busy = false, generation = 0, controller = null, proposal = null, proposalRevision = -1;
    let pendingRow = null, proposalIsTranslation = false, proposalStartsProduct = false, pendingMode = null, buildName = '';
    let history = [], textConsent = false, applying = false, account, statusGeneration = 0, opener = $('open-ai-chat');
    const initial = editor.snapshot();
    let activeView = initial.model.activeViewId, activePhoto = initial.model.photoId, productContext = initial.productContextId;
    const fieldChoices = [...$('ai-chat-proposal').querySelectorAll('[data-ai-field]')];
    const selectedFields = () => fieldChoices.filter(field => field.checked).map(field => field.dataset.aiField);
    const status = (text, error = false) => { $('ai-chat-status').textContent = text; $('ai-chat-status').classList.toggle('error', error); };
    function buttons() {
      $('ai-chat-send').disabled = busy || !configured || !$('ai-chat-input').value.trim();
      $('ai-chat-stop').hidden = !busy;
      $('ai-chat-input').readOnly = busy;
      $('ai-translate').disabled = busy || !configured;
      $('ai-build-send').disabled = busy || !configured || !$('ai-build-name').value.trim();
      $('ai-apply').disabled = busy || !proposal || !$('ai-reviewed').checked ||
        (!proposalIsTranslation && !selectedFields().length && !$('ai-apply-template').checked);
      resizeInput();
    }
    function resizeInput() {
      const input = $('ai-chat-input'); input.style.height = 'auto';
      const height = Math.max(44, Math.min(140, input.scrollHeight));
      input.style.height = height + 'px'; input.style.overflowY = input.scrollHeight > 140 ? 'auto' : 'hidden';
    }
    function discardProposal() { proposal = null; proposalIsTranslation = false; proposalStartsProduct = false; $('ai-chat-proposal').hidden = true; $('ai-reviewed').checked = false; }
    function invalidate(text, keepDraft = false) {
      $('ai-data-consent').hidden = true;
      ++generation;
      controller?.abort(); controller = null; busy = false;
      pendingRow?.remove(); pendingRow = null;
      if (!keepDraft) discardProposal();
      buttons();
      if (text !== undefined) status(text);
    }
    function clearChat(text) { invalidate(text); textConsent = false; history = []; pendingMode = null; buildName = ''; $('ai-chat-messages').replaceChildren(); }
    function closeBuild() { $('ai-build-panel').hidden = true; $('ai-build-toggle').setAttribute('aria-expanded', 'false'); }
    function resetProduct(text) {
      clearChat(text);
      for (const id of ['ai-facts', 'ai-chat-input', 'ai-build-name', 'ai-build-facts']) $(id).value = '';
      $('ai-photo-consent').checked = $('ai-groq-consent').checked = false;
      closeBuild(); buttons();
    }
    function trimMessages() {
      while ($('ai-chat-messages').children.length > 8) $('ai-chat-messages').firstElementChild.remove();
    }
    function append(role, content) {
      const row = document.createElement('div'), label = document.createElement('strong'), paragraph = document.createElement('p');
      row.className = 'ai-message'; row.dataset.role = role; row.setAttribute('aria-label', role === 'user' ? 'Вы' : 'sAI'); label.textContent = role === 'user' ? 'Вы' : 'sAI'; paragraph.textContent = content;
      row.append(label, paragraph); $('ai-chat-messages').append(row);
      return row;
    }
    function open(event) {
      if (!$('ai-chat').hidden) { $('ai-chat-input').focus(); return; }
      opener = event?.currentTarget || $('open-ai-chat');
      $('ai-chat').hidden = false; document.body.classList.add('ai-chat-open');
      document.querySelectorAll('[data-open-ai]').forEach(button => button.setAttribute('aria-expanded', 'true'));
      resizeInput(); $('ai-chat-input').focus();
    }
    function close(restoreFocus = true) {
      const wasBusy = busy; invalidate(wasBusy ? 'Запрос остановлен. Попытка могла учитываться в лимите.' : '', true);
      $('ai-chat').hidden = true; document.body.classList.remove('ai-chat-open');
      document.querySelectorAll('[data-open-ai]').forEach(button => button.setAttribute('aria-expanded', 'false'));
      if (restoreFocus) opener.focus();
    }
    document.querySelectorAll('[data-open-ai]').forEach(button => button.addEventListener('click', open));
    $('ai-chat-close').addEventListener('click', () => close());
    document.addEventListener('satucard:preflight-open', () => close(false));
    $('ai-chat').addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    });
    async function checkConnection() {
      const token = ++statusGeneration; $('ai-chat-recheck').disabled = true;
      try {
        if (location.protocol === 'file:') throw new Error('Local mode');
        const response = await fetch('api/chat', { cache: 'no-store', ...(typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(8000) } : {}) });
        const result = response.ok ? await response.json() : {};
        if (token !== statusGeneration) return;
        const nextProvider = result.provider === 'gemini' ? 'gemini' : 'openai';
        const nextSingleUserPilot = nextProvider === 'gemini' && result.singleUserPilot === true;
        if (activeProvider && (nextProvider !== activeProvider || nextSingleUserPilot !== singleUserPilot)) {
          clearChat('Настройки sAI изменились. Начните новый чат.');
          $('ai-photo-consent').checked = false;
        }
        activeProvider = nextProvider;
        singleUserPilot = nextSingleUserPilot;
        groqAvailable = nextProvider === 'gemini' && result.groqFallbackAvailable === true;
        $('ai-groq-option').hidden = !groqAvailable;
        if (!groqAvailable) $('ai-groq-consent').checked = false;
        const providerName = activeProvider === 'gemini' ? 'Google Gemini' : 'OpenAI';
        $('ai-data-question').textContent = `Передать ${providerName} запрос, тексты карточки, факты и историю этого чата?`;
        $('ai-google-data-policy').hidden = activeProvider !== 'gemini';
        $('ai-photo-consent').parentElement.lastChild.textContent = ` Разрешаю отправить уменьшенное основное фото ${providerName} для выбора оформления. Не для определения свойств товара.`;
        configured = result.available === true;
      } catch {
        if (token !== statusGeneration) return;
        configured = false;
      } finally { if (token === statusGeneration) { $('ai-chat-setup').hidden = configured; $('ai-chat-recheck').disabled = false; buttons(); } }
    }
    $('ai-chat-recheck').addEventListener('click', checkConnection);
    $('ai-chat-input').addEventListener('input', () => { $('ai-data-consent').hidden = true; buttons(); });
    $('ai-chat-input').addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
          event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      const send = $('ai-chat-send');
      if (!event.repeat && !send.disabled) $('ai-chat-form').requestSubmit(send);
    });
    window.addEventListener('resize', resizeInput);
    $('ai-data-cancel').addEventListener('click', () => { $('ai-data-consent').hidden = true; $('ai-chat-input').focus(); });
    $('ai-data-confirm').addEventListener('click', () => {
      if ($('ai-data-consent').hidden) return;
      textConsent = true; $('ai-data-consent').hidden = true; $('ai-chat-form').requestSubmit(); $('ai-chat-input').focus();
    });
    $('ai-chat-new').addEventListener('click', () => { resetProduct(''); $('ai-chat-input').focus(); });
    $('ai-chat-stop').addEventListener('click', () => invalidate('Ожидание остановлено. Уже отправленный запрос может учитываться в лимите.', true));
    $('ai-dismiss').addEventListener('click', () => { discardProposal(); buttons(); status('Предложение отклонено. Можно уточнить запрос.'); });
    ['ai-language', 'ai-tone', 'ai-facts', 'ai-photo-consent', 'ai-groq-consent'].forEach(id => $(id).addEventListener('input', () => {
      if (busy || proposal) invalidate('Данные обновлены. Отправь следующий запрос, чтобы учесть изменения.');
    }));
    $('ai-build-toggle').addEventListener('click', () => {
      if (!$('ai-build-panel').hidden) { closeBuild(); return; }
      $('ai-build-panel').hidden = false;
      $('ai-build-toggle').setAttribute('aria-expanded', 'true');
      $('ai-build-name').value = buildName || editor.snapshot().productSettings.title;
      $('ai-build-facts').value = $('ai-facts').value;
      $('ai-build-name').focus(); buttons();
    });
    $('ai-build-name').addEventListener('input', buttons);
    $('ai-build-send').addEventListener('click', () => {
      const name = $('ai-build-name').value.trim();
      if (!name || busy || !configured) return;
      const facts = $('ai-build-facts').value;
      if (name !== (buildName || editor.snapshot().productSettings.title)) {
        clearChat('');
        $('ai-photo-consent').checked = false;
      } else if (facts !== $('ai-facts').value) {
        invalidate('');
      }
      buildName = name;
      pendingMode = 'build';
      $('ai-facts').value = facts;
      $('ai-chat-input').value = 'Собери карточку для товара «' + name + '».';
      closeBuild(); buttons();
      $('ai-chat-form').requestSubmit($('ai-chat-send'));
    });
    $('ai-translate').addEventListener('click', () => {
      const snapshot = editor.snapshot();
      if (snapshot.model.views.length >= 8) { status('В комплекте уже 8 карточек. Освободи место для перевода.', true); return; }
      if (!snapshot.model.settings.title.trim()) { status('Сначала добавь название карточки для перевода.', true); return; }
      closeBuild();
      $('ai-language').value = 'kk';
      pendingMode = 'translate';
      $('ai-chat-input').value = 'Переведи текущую карточку на қазақша, сохрани название модели, числа и единицы.';
      $('ai-chat-input').focus(); buttons();
    });
    for (const [id, template] of Object.entries(renderer.templates)) { const option = document.createElement('option'); option.value = id; option.textContent = template.label; $('ai-edit-template').append(option); }
    function editedProposal() { return { title: $('ai-edit-title').value.trim(), subtitle: $('ai-edit-subtitle').value, description: $('ai-edit-description').value, features: [1, 2, 3].map(index => $('ai-edit-feature-' + index).value.trim()).filter(Boolean), template: $('ai-edit-template').value }; }
    function showProposal(draft, revision, snapshot, { translate, newProduct, suggestTemplate }) {
      proposal = draft; proposalRevision = revision;
      proposalIsTranslation = translate; proposalStartsProduct = newProduct;
      const settings = newProduct ? snapshot.productSettings : snapshot.model.settings;
      for (const key of ['title', 'subtitle', 'description']) $('ai-edit-' + key).value = draft[key];
      for (const index of [1, 2, 3]) $('ai-edit-feature-' + index).value = draft.features[index - 1] || '';
      for (const choice of fieldChoices) {
        const key = choice.dataset.aiField, before = settings[key], after = draft[key];
        const current = Array.isArray(before) ? before.filter(Boolean).join(' · ') : before;
        const next = Array.isArray(after) ? after.join(' · ') : after;
        choice.checked = current !== next;
        $('ai-before-' + key).textContent = 'Сейчас: ' + (current || 'пусто');
      }
      $('ai-edit-template').value = draft.template;
      $('ai-apply-template').checked = suggestTemplate && draft.template !== settings.template;
      $('ai-apply-colors').checked = false;
      $('ai-apply-colors').disabled = !$('ai-apply-template').checked;
      $('ai-reviewed').checked = false;
      $('ai-proposal-target').textContent = translate ? 'Перевод сохранится в отдельной карточке комплекта.' : 'Отметь поля, которые хочешь применить.';
      $('ai-apply').textContent = translate ? 'Создать копию на қазақша' : 'Применить к карточке';
      $('ai-chat-proposal').hidden = false; preview();
    }
    function preview() {
      if (!proposal) return;
      const snapshot = editor.snapshot(), draft = editedProposal(), settings = { ...(proposalStartsProduct ? snapshot.productSettings : snapshot.model.settings) };
      for (const field of selectedFields()) settings[field] = draft[field];
      if ($('ai-apply-template').checked) {
        settings.template = draft.template; settings.customColors = !$('ai-apply-colors').checked;
        if ($('ai-apply-colors').checked) Object.assign(settings, { background: renderer.templates[draft.template].background, accent: renderer.templates[draft.template].accent, textColor: renderer.templates[draft.template].textColor });
      }
      const images = proposalStartsProduct ? snapshot.productImages : snapshot.images;
      if (images.photo !== snapshot.images.photo) settings.photo = renderer.normalize({}).photo;
      renderer.render($('ai-proposal-preview'), settings, images, { scale: .2 });
    }
    $('ai-chat-proposal').addEventListener('input', event => {
      if (event.target.id !== 'ai-reviewed') $('ai-reviewed').checked = false;
      const editedField = event.target.id.startsWith('ai-edit-feature-') ? 'features' : event.target.id.slice('ai-edit-'.length);
      if (event.target.id.startsWith('ai-edit-')) {
        const choice = fieldChoices.find(field => field.dataset.aiField === editedField);
        if (choice) choice.checked = true;
      }
      $('ai-apply-colors').disabled = !$('ai-apply-template').checked;
      if (!$('ai-apply-template').checked) $('ai-apply-colors').checked = false;
      buttons();
      preview();
    });
    function validReply(result) {
      if (!result || typeof result.reply !== 'string' || !result.reply.trim() || result.reply.length > 1400 || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result.reply)) return false;
      const p = result.proposal;
      if (p === null) return true;
      return p && Object.hasOwn(renderer.templates, p.template) && ['title', 'subtitle', 'description'].every((key, index) => typeof p[key] === 'string' && p[key].length <= [60,90,180][index] && !/[<>\u0000-\u001f]/.test(p[key])) && p.title.trim() && Array.isArray(p.features) && p.features.length <= 3 && p.features.every(v => typeof v === 'string' && v.length <= 38 && !/[<>\u0000-\u001f]/.test(v));
    }
    function thumbnail(photo) {
      if (!photo?.naturalWidth || !photo?.naturalHeight) throw new Error('Добавьте фото или снимите разрешение на его отправку.');
      const canvas = document.createElement('canvas'), scale = Math.min(1, 768 / photo.naturalWidth, 768 / photo.naturalHeight);
      canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
      const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(photo, 0, 0, canvas.width, canvas.height);
      const value = canvas.toDataURL('image/jpeg', .8);
      if (value.length > 750000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value)) throw new Error('Не удалось подготовить уменьшенное фото. Отключите его отправку.');
      return value;
    }
    $('ai-chat-form').addEventListener('submit', async event => {
      event.preventDefault(); if (busy || !configured) return;
      const message = $('ai-chat-input').value.trim(); if (!message || message.length > 1500) return;
      if (!singleUserPilot && !textConsent) { $('ai-data-consent').hidden = false; $('ai-data-confirm').focus(); return; }
      const snapshot = editor.snapshot(), revision = editor.revision;
      const previousProposal = proposal && proposalRevision === revision ? editedProposal() : null;
      const mode = pendingMode;
      const translate = mode === 'translate' || (!mode && proposalIsTranslation);
      const newProduct = Boolean(snapshot.sampleKey && (mode === 'build' || proposalStartsProduct));
      invalidate(undefined, true); const token = generation;
      const current = () => token === generation && revision === editor.revision;
      busy = true; buttons(); status('sAI отвечает…');
      const ownController = new AbortController(); controller = ownController;
      const timer = setTimeout(() => ownController.abort(), 75000);
      try {
        const session = await window.SATUCARD_AUTH?.getSession();
        if (!current()) return;
        if (!session) throw new Error('Войдите в аккаунт и завершите профиль. Бесплатный редактор доступен без входа.');
        if (account !== undefined && session.user?.id !== account) {
          account = session.user?.id;
          resetProduct('Аккаунт изменился. Начните новый чат.');
          return;
        }
        account = session.user?.id;
        const settings = newProduct ? snapshot.productSettings : snapshot.model.settings;
        const body = { message, history: history.slice(-8), card: { title: settings.title, subtitle: settings.subtitle, description: settings.description, features: [...settings.features].filter(Boolean), template: settings.template }, facts: $('ai-facts').value, language: $('ai-language').value, tone: $('ai-tone').value };
        if (mode === 'build' && buildName) {
          if (buildName !== body.card.title) Object.assign(body.card, { title: buildName, subtitle: '', description: '', features: [] });
        }
        if (mode) body.mode = mode;
        if (previousProposal?.title) body.previousProposal = previousProposal;
        if (groqAvailable && $('ai-groq-consent').checked) body.groqFallbackConsent = true;
        if (!newProduct && $('ai-photo-consent').checked) { body.imageDataUrl = thumbnail(snapshot.images.photo); body.imageConsent = true; }
        pendingRow = append('user', message);
        const response = await fetch('api/chat', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ownController.signal });
        const result = await response.json().catch(() => null);
        if (!current()) return;
        if (!response.ok) {
          if (result?.code === 'gemini_quota' && groqAvailable && !body.groqFallbackConsent) {
            $('ai-groq-option').closest('details').open = true;
            throw new Error('Лимит Gemini исчерпан. Включи Groq в настройках чата и повтори запрос.');
          }
          throw new Error(result?.error || 'Не удалось получить ответ. Попробуй позже.');
        }
        if (!validReply(result)) throw new Error('Некорректный ответ sAI. Карточка не изменена.');
        pendingRow = null;
        append('assistant', result.reply);
        trimMessages();
        history.push({ role: 'user', content: message }, { role: 'assistant', content: result.reply });
        history = history.slice(-8); while (history.reduce((sum, item) => sum + item.content.length, 0) > 12000) history.splice(0, 2);
        $('ai-chat-input').value = '';
        if (result.proposal || mode === 'translate') pendingMode = null;
        const providerNote = result.providerUsed === 'groq' ? ' Ответ подготовил Groq.' : '';
        if (result.proposal) {
          showProposal(result.proposal, revision, snapshot, { translate, newProduct, suggestTemplate: mode === 'build' });
          status('Черновик готов. Проверь изменения перед применением.' + providerNote);
        } else status('Можно продолжить разговор. Карточка не менялась.' + providerNote);
        $('ai-chat-messages').lastElementChild?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      } catch (error) { if (current()) { pendingRow?.remove(); pendingRow = null; status(error.name === 'AbortError' ? 'Время ожидания истекло. Попытка могла учитываться в лимите. Повторите позже.' : error.message, true); } }
      finally { clearTimeout(timer); if (token === generation) { controller = null; busy = false; buttons(); } }
    });
    $('ai-apply').addEventListener('click', () => {
      if (busy || !proposal || !$('ai-reviewed').checked) return;
      try {
        const draft = editedProposal(), fields = selectedFields(), duplicate = proposalIsTranslation;
        if (fields.includes('title') && !draft.title) throw new Error('Введите название карточки.');
        const template = $('ai-apply-template').checked ? draft.template : undefined;
        if (!duplicate && !fields.length && !template) return;
        applying = true;
        editor.applyCopy(draft, proposalRevision, { fields, duplicate, newProduct: proposalStartsProduct, template, replaceColors: $('ai-apply-colors').checked });
        const snapshot = editor.snapshot();
        activeView = snapshot.model.activeViewId; activePhoto = snapshot.model.photoId; productContext = snapshot.productContextId;
        if (duplicate) resetProduct('Копия на қазақша создана. Действие можно отменить ↶.');
        else {
          if (proposalStartsProduct) $('ai-photo-consent').checked = false;
          discardProposal(); buildName = ''; buttons();
          status('Изменения применены. Можно отменить одним нажатием ↶ или продолжить чат.');
        }
      } catch (error) { status(error.message, true); } finally { applying = false; }
    });
    document.addEventListener('satucard:editor-change', () => {
      if (applying) return;
      const snapshot = editor.snapshot(), model = snapshot.model, view = model.activeViewId;
      const photoChanged = activePhoto !== model.photoId;
      const contextChanged = snapshot.productContextId !== productContext;
      const viewChanged = view !== activeView;
      activePhoto = model.photoId; activeView = view; productContext = snapshot.productContextId;
      if (contextChanged || viewChanged) resetProduct('Выбран другой товар или карточка. Можно начать новый разговор.');
      else if (photoChanged) { invalidate('Выбрано другое фото. Разрешение на его отправку сброшено.'); $('ai-photo-consent').checked = false; }
      else if (busy || proposal) invalidate('Карточка изменилась. Уточните запрос, чтобы учесть новые правки.');
    });
    ['load-project-input', 'restore-draft-button', 'photo-input'].forEach(id => $(id)?.addEventListener(id.includes('input') ? 'change' : 'click', () => {
      $('ai-photo-consent').checked = false;
      if (busy || proposal) invalidate('Исходные данные обновляются.');
    }));
    document.addEventListener('satucard:authchange', event => {
      const next = event.detail?.user?.id || null;
      if (account !== undefined && next !== account) resetProduct('Аккаунт изменился. Переписка очищена.');
      account = next;
    });
    window.SATUCARD_AUTH?.getSession().then(session => { if (account === undefined) account = session?.user?.id || null; }).catch(() => {});
    window.addEventListener('pagehide', () => resetProduct(''));
    checkConnection();
  }
  document.addEventListener('satucard:editor-ready', start);
  if ($('editor-form')?.dataset.editorReady === 'true') start();
})();
