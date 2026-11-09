'use strict';

(() => {
  const $ = id => document.getElementById(id);
  let started = false;
  function start() {
    if (started || !window.SATUCARD_EDITOR || !$('ai-chat')) return;
    started = true;
    const editor = window.SATUCARD_EDITOR, renderer = window.SATUCARD_RENDERER;
    let activeProvider = null, singleUserPilot = false;
    let configured = false, busy = false, generation = 0, controller = null, proposal = null, proposalRevision = -1;
    let history = [], textConsent = false, applying = false, account, statusGeneration = 0, opener = $('open-ai-chat');
    let activeView = editor.snapshot().model.activeViewId, activePhoto = editor.snapshot().model.photoId;
    const status = (text, error = false) => { $('ai-chat-status').textContent = text; $('ai-chat-status').classList.toggle('error', error); };
    const buttons = () => { $('ai-chat-send').disabled = busy || !configured || !$('ai-chat-input').value.trim(); $('ai-chat-stop').hidden = !busy; $('ai-chat-input').readOnly = busy; resizeInput(); };
    function resizeInput() {
      const input = $('ai-chat-input'); input.style.height = 'auto';
      const height = Math.max(44, Math.min(140, input.scrollHeight));
      input.style.height = height + 'px'; input.style.overflowY = input.scrollHeight > 140 ? 'auto' : 'hidden';
    }
    function discardProposal() { proposal = null; $('ai-chat-proposal').hidden = true; $('ai-reviewed').checked = false; $('ai-apply').disabled = true; }
    function invalidate(text) { $('ai-data-consent').hidden = true; ++generation; controller?.abort(); controller = null; busy = false; discardProposal(); buttons(); if (text !== undefined) status(text); }
    function clearChat(text) { invalidate(text); textConsent = false; history = []; $('ai-chat-messages').replaceChildren(); }
    function append(role, content) {
      const row = document.createElement('div'), label = document.createElement('strong'), paragraph = document.createElement('p');
      row.className = 'ai-message'; row.dataset.role = role; row.setAttribute('aria-label', role === 'user' ? 'Вы' : 'sAI'); label.textContent = role === 'user' ? 'Вы' : 'sAI'; paragraph.textContent = content;
      row.append(label, paragraph); $('ai-chat-messages').append(row);
      // Match the bounded server context; old turns are not silently stored forever.
      while ($('ai-chat-messages').children.length > 8) $('ai-chat-messages').firstElementChild.remove();
      return row;
    }
    function open(event) {
      if (!$('ai-chat').hidden) { $('ai-chat-input').focus(); return; }
      opener = event?.currentTarget || $('open-ai-chat');
      $('ai-chat').hidden = false; document.body.classList.add('ai-chat-open');
      document.querySelectorAll('[data-open-ai]').forEach(button => button.setAttribute('aria-expanded', 'true'));
      resizeInput(); $('ai-chat-input').focus();
    }
    function close() {
      const wasBusy = busy; invalidate(wasBusy ? 'Запрос остановлен. Попытка могла учитываться в лимите.' : '');
      $('ai-chat').hidden = true; document.body.classList.remove('ai-chat-open');
      document.querySelectorAll('[data-open-ai]').forEach(button => button.setAttribute('aria-expanded', 'false'));
      opener.focus();
    }
    document.querySelectorAll('[data-open-ai]').forEach(button => button.addEventListener('click', open));
    $('ai-chat-close').addEventListener('click', close);
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
    $('ai-chat-new').addEventListener('click', () => { clearChat(''); status(''); $('ai-chat-input').value = ''; $('ai-facts').value = ''; $('ai-photo-consent').checked = false; buttons(); $('ai-chat-input').focus(); });
    $('ai-chat-stop').addEventListener('click', () => invalidate('Ожидание остановлено. Уже отправленный запрос может учитываться в лимите и расходах.'));
    $('ai-dismiss').addEventListener('click', () => { discardProposal(); status('Предложение отклонено. Можно уточнить запрос.'); });
    ['ai-language', 'ai-tone', 'ai-facts', 'ai-photo-consent'].forEach(id => $(id).addEventListener('input', () => clearChat('Условия изменены. Следующий запрос начнёт новую переписку.')));
    for (const [id, template] of Object.entries(renderer.templates)) { const option = document.createElement('option'); option.value = id; option.textContent = template.label; $('ai-edit-template').append(option); }
    function editedProposal() { return { title: $('ai-edit-title').value.trim(), subtitle: $('ai-edit-subtitle').value, description: $('ai-edit-description').value, features: [1, 2, 3].map(index => $('ai-edit-feature-' + index).value).filter(Boolean), template: $('ai-edit-template').value }; }
    function preview() {
      if (!proposal) return;
      const snapshot = editor.snapshot(), draft = editedProposal(), settings = { ...snapshot.model.settings, title: draft.title, subtitle: draft.subtitle, description: draft.description, features: draft.features };
      if ($('ai-apply-template').checked) {
        settings.template = draft.template; settings.customColors = !$('ai-apply-colors').checked;
        if ($('ai-apply-colors').checked) Object.assign(settings, { background: renderer.templates[draft.template].background, accent: renderer.templates[draft.template].accent, textColor: renderer.templates[draft.template].textColor });
      }
      renderer.render($('ai-proposal-preview'), settings, snapshot.images, { scale: .2 });
    }
    $('ai-chat-proposal').addEventListener('input', event => {
      if (event.target.id !== 'ai-reviewed') $('ai-reviewed').checked = false;
      $('ai-apply-colors').disabled = !$('ai-apply-template').checked;
      if (!$('ai-apply-template').checked) $('ai-apply-colors').checked = false;
      $('ai-apply').disabled = !proposal || !$('ai-reviewed').checked;
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
      invalidate(); const token = generation, snapshot = editor.snapshot(), revision = editor.revision;
      const current = () => token === generation && revision === editor.revision;
      busy = true; buttons(); status('sAI отвечает…');
      const ownController = new AbortController(); controller = ownController;
      const timer = setTimeout(() => ownController.abort(), 75000);
      let userRow;
      try {
        const session = await window.SATUCARD_AUTH?.getSession();
        if (!current()) return;
        if (!session) throw new Error('Войдите в аккаунт и завершите профиль. Бесплатный редактор доступен без входа.');
        if (account !== undefined && session.user?.id !== account) { clearChat('Аккаунт изменился. Начните новый чат.'); return; }
        account = session.user?.id;
        const settings = snapshot.model.settings;
        const body = { message, history: history.slice(-8), card: { title: settings.title, subtitle: settings.subtitle, description: settings.description, features: [...settings.features].filter(Boolean), template: settings.template }, facts: $('ai-facts').value, language: $('ai-language').value, tone: $('ai-tone').value };
        if ($('ai-photo-consent').checked) { body.imageDataUrl = thumbnail(snapshot.images.photo); body.imageConsent = true; }
        userRow = append('user', message);
        const response = await fetch('api/chat', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ownController.signal });
        const result = await response.json();
        if (!current()) return;
        if (!response.ok) throw new Error(result.error || 'Не удалось получить ответ. Попробуйте позже.');
        if (!validReply(result)) throw new Error('Некорректный ответ sAI. Карточка не изменена.');
        append('assistant', result.reply);
        history.push({ role: 'user', content: message }, { role: 'assistant', content: result.reply });
        history = history.slice(-8); while (history.reduce((sum, item) => sum + item.content.length, 0) > 12000) history.splice(0, 2);
        $('ai-chat-input').value = '';
        if (result.proposal) {
          proposal = result.proposal; proposalRevision = revision;
          ['title','subtitle','description'].forEach(key => { $('ai-edit-' + key).value = proposal[key]; });
          [1,2,3].forEach(index => { $('ai-edit-feature-' + index).value = proposal.features[index - 1] || ''; });
          $('ai-edit-template').value = proposal.template; $('ai-apply-template').checked = false; $('ai-apply-colors').checked = false; $('ai-apply-colors').disabled = true;
          $('ai-reviewed').checked = false; $('ai-apply').disabled = true; $('ai-chat-proposal').hidden = false; preview();
          status('Предложение готово. Проверьте его и нажмите «Применить». Карточка пока не менялась.');
        } else status('Можно продолжить разговор. Карточка не менялась.');
        userRow = null;
        $('ai-chat-messages').lastElementChild?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      } catch (error) { if (current()) { userRow?.remove(); status(error.name === 'AbortError' ? 'Время ожидания истекло. Попытка могла учитываться в лимите. Повторите позже.' : error.message, true); } }
      finally { clearTimeout(timer); if (token === generation) { controller = null; busy = false; buttons(); } }
    });
    $('ai-apply').addEventListener('click', () => {
      if (!proposal || !$('ai-reviewed').checked) return;
      try {
        const draft = editedProposal(); if (!draft.title) throw new Error('Введите название карточки.');
        applying = true;
        editor.applyCopy(draft, proposalRevision, $('ai-apply-template').checked ? { template: draft.template, replaceColors: $('ai-apply-colors').checked } : {});
        discardProposal(); status('Изменения применены. Можно отменить одним нажатием ↶ или продолжить чат.');
      } catch (error) { status(error.message, true); } finally { applying = false; }
    });
    document.addEventListener('satucard:editor-change', () => {
      if (applying) return;
      const model = editor.snapshot().model, view = model.activeViewId;
      const photoChanged = activePhoto !== model.photoId; activePhoto = model.photoId;
      if (view !== activeView) { activeView = view; clearChat('Выбрана другая карточка. Начните новую переписку.'); $('ai-photo-consent').checked = false; $('ai-facts').value = ''; $('ai-chat-input').value = ''; buttons(); }
      else if (photoChanged) { clearChat('Выбрано другое фото. Разрешение на его отправку сброшено.'); $('ai-photo-consent').checked = false; }
      else if (busy || proposal) invalidate('Карточка изменилась. Уточните запрос, чтобы учесть новые правки.');
    });
    ['load-project-input','reset-button','restore-draft-button','photo-input'].forEach(id => $(id)?.addEventListener(id.includes('input') ? 'change' : 'click', () => { clearChat('Исходные данные изменились. Начните новую переписку.'); $('ai-photo-consent').checked = false; if (id !== 'photo-input') { $('ai-facts').value = ''; $('ai-chat-input').value = ''; buttons(); } }));
    document.addEventListener('satucard:authchange', event => {
      const next = event.detail?.user?.id || null;
      if (account !== undefined && next !== account) { clearChat('Аккаунт изменился. Переписка очищена.'); $('ai-facts').value = ''; $('ai-chat-input').value = ''; $('ai-photo-consent').checked = false; buttons(); }
      account = next;
    });
    window.SATUCARD_AUTH?.getSession().then(session => { if (account === undefined) account = session?.user?.id || null; }).catch(() => {});
    window.addEventListener('pagehide', () => { clearChat(); $('ai-photo-consent').checked = false; });
    checkConnection();
  }
  document.addEventListener('satucard:editor-ready', start);
  if ($('editor-form')?.dataset.editorReady === 'true') start();
})();
