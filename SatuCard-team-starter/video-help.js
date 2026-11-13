const SEEN_KEY = 'satucard-video-tour-seen-v2';
const STEPS = [
  { title: 'Выберите настроение', text: 'Нажмите на шаблон под фильтрами. В «Яркие» — 24 цветных варианта. Смена шаблона заменяет монтаж: свой ролик сначала скачайте как проект.', panel: 'templates', target: '#template-filters' },
  { title: 'Добавьте свой товар', text: 'Нажмите «Добавить файлы». Под загруженным фото выберите «Заменить товар» — оно появится во всех сценах. Можно потренироваться на готовом примере.', panel: 'media', target: '#import-media' },
  { title: 'Напишите о товаре', text: 'Введите название здесь. Ниже укажите цену, магазин, призыв и три преимущества. Нажмите «Обновить ролик», чтобы применить их ко всем сценам.', panel: 'brand', target: '#product-form [name="title"]' },
  { title: 'Соберите историю', text: 'Стрелки меняют порядок сцен, «Копия» повторяет сцену, а «×» удаляет её. На монтажной шкале под холстом можно отдельно двигать и обрезать слои.', panel: 'workflow', target: '#scene-list .scene-card', fallback: '.timeline' },
  { title: 'Посмотрите результат', text: 'Нажмите ▶ и проверьте все сцены. Этой же кнопкой остановите ролик. Во время обучения можно менять настройки и сразу смотреть результат.', target: '.transport' },
  { title: 'Добавьте музыку или голос', text: 'Нажмите на дорожку, чтобы добавить музыку. Ниже можно загрузить свой звук или записать голос. Запись остаётся на устройстве; ИИ-озвучка пока выключена.', panel: 'audio', target: '#music-list .music-card' },
  { title: 'Покажите слова на экране', text: 'Вставьте сюда текст с таймкодами SRT/VTT или загрузите файл кнопкой ниже. Нажмите «Добавить». Русский и казахский поддерживаются.', panel: 'text', target: '#subtitle-source' },
  { title: 'Сохраните возможность редактировать', text: 'Скачайте файл .satuvideo.json с монтажом и исходниками. Его можно открыть позже или перенести на другое устройство. Автосохранение хранит один черновик в этом браузере.', target: () => matchMedia('(max-width:900px)').matches ? '#save-file-mobile' : '#save-file' },
  { title: 'Скачайте готовый ролик', text: 'Нажмите «Экспорт», выберите качество, затем «Собрать MP4» и «Скачать MP4». Дождитесь завершения сборки и проверьте готовое видео.', target: '#export' },
];

export function installVideoHelp({ showPanel, stop }) {
  const create = (tag, text, className) => { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; };
  const tour = create('section', null, 'video-help-tour');
  tour.id = 'video-help-tour'; tour.hidden = true; tour.dataset.videoTour = '';
  tour.setAttribute('role', 'dialog'); tour.setAttribute('aria-modal', 'false'); tour.setAttribute('aria-labelledby', 'video-help-title'); tour.setAttribute('aria-describedby', 'video-help-description');
  const top = create('div', null, 'video-tour-top'), number = create('p', null, 'help-number'); number.setAttribute('aria-live', 'polite');
  const closeButton = create('button', '×'); closeButton.type = 'button'; closeButton.setAttribute('aria-label', 'Закрыть инструктаж'); top.append(number, closeButton);
  const progress = create('progress'); progress.max = STEPS.length; progress.setAttribute('aria-label', 'Прогресс инструктажа');
  const title = create('h2'), description = create('p', null, 'help-description'); title.id = 'video-help-title'; title.tabIndex = -1; description.id = 'video-help-description';
  const hint = create('p', 'Можно пробовать действия прямо во время обучения.', 'video-tour-hint');
  const actions = create('div', null, 'button-row'), back = create('button', 'Назад'), next = create('button', 'Далее →', 'primary'); back.type = next.type = 'button'; actions.append(back, next);
  const manual = create('a', 'Подробная инструкция ↗', 'help-manual'); manual.href = 'video-guide.html'; manual.target = '_blank'; manual.rel = 'noopener';
  tour.append(top, progress, title, description, hint, actions, manual);
  const highlight = create('div', null, 'video-tour-highlight'); highlight.hidden = true; highlight.setAttribute('aria-hidden', 'true'); document.body.append(highlight, tour);
  let index = -1, target = null, returnFocus = null, frame = 0;
  const selector = step => typeof step.target === 'function' ? step.target() : step.target;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const visible = el => Boolean(el?.getClientRects().length && !el.closest('[hidden]'));
  function findTarget() {
    const step = STEPS[index]; let found = document.querySelector(selector(step));
    if (!visible(found) && step.fallback) found = document.querySelector(step.fallback);
    return visible(found) ? found : null;
  }
  function clearTarget() { target?.classList.remove('video-tour-target'); target = null; highlight.hidden = true; }
  function clippedRect(el) {
    const rect = el.getBoundingClientRect();
    let left = Math.max(8, rect.left), top = Math.max(8, rect.top), right = Math.min(innerWidth - 8, rect.right), bottom = Math.min(innerHeight - 8, rect.bottom);
    for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, box.left); right = Math.min(right, box.right); }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
    }
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }
  function position() {
    frame = 0; if (index < 0) return;
    const found = findTarget(); if (found !== target) { clearTarget(); target = found; target?.classList.add('video-tour-target'); }
    document.body.style.setProperty('--video-tour-space', `${tour.offsetHeight + 36}px`); tour.dataset.step = String(index + 1);
    if (!target) { highlight.hidden = true; tour.style.left = '16px'; tour.style.top = `${Math.max(12, innerHeight - tour.offsetHeight - 16)}px`; return; }
    const rect = clippedRect(target), width = tour.offsetWidth, height = tour.offsetHeight, margin = 16, gap = 20;
    const horizontal = clamp((rect.left + rect.right - width) / 2, margin, innerWidth - width - margin), vertical = clamp(rect.top, margin, innerHeight - height - margin);
    if (innerWidth > 700) {
      const candidates = [
        { left: rect.right + gap, top: vertical }, { left: rect.left - width - gap, top: vertical },
        { left: horizontal, top: rect.bottom + gap }, { left: horizontal, top: rect.top - height - gap },
      ];
      const fit = candidates.find(p => p.left >= margin && p.top >= margin && p.left + width <= innerWidth - margin && p.top + height <= innerHeight - margin);
      const chosen = fit || { left: rect.left > innerWidth / 2 ? margin : innerWidth - width - margin, top: innerHeight - height - margin };
      tour.style.left = `${chosen.left}px`; tour.style.top = `${chosen.top}px`;
    } else { tour.style.removeProperty('left'); tour.style.removeProperty('top'); }
    const bottom = innerWidth <= 700 ? Math.min(rect.bottom, tour.getBoundingClientRect().top - 14) : rect.bottom;
    highlight.hidden = rect.width <= 0 || bottom <= rect.top;
    Object.assign(highlight.style, { left: `${rect.left - 5}px`, top: `${rect.top - 5}px`, width: `${Math.max(0, rect.width) + 10}px`, height: `${Math.max(0, bottom - rect.top) + 10}px` });
  }
  function schedulePosition() { if (index >= 0 && !frame) frame = requestAnimationFrame(position); }
  function reveal() {
    if (index < 0) return;
    target = findTarget(); target?.classList.add('video-tour-target'); target?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); position();
    if (target && innerWidth <= 700) {
      const bottom = tour.getBoundingClientRect().top - 24; let rect = target.getBoundingClientRect();
      for (let parent = target.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (parent.scrollHeight > parent.clientHeight && /(auto|scroll)/.test(getComputedStyle(parent).overflowY)) { parent.scrollTop += Math.max(0, rect.bottom - bottom); rect = target.getBoundingClientRect(); }
      }
      if (rect.bottom > bottom) window.scrollBy({ top: rect.bottom - bottom, behavior: 'instant' }); position();
    }
  }
  function preparePanel() {
    const step = STEPS[index]; if (step.panel) showPanel(step.panel);
    if (step.panel === 'workflow') document.querySelector('[data-workflow-tab="scenes"]')?.click();
    if (index === 7 && matchMedia('(max-width:900px)').matches) showPanel('media');
  }
  function showStep(nextIndex) {
    clearTarget(); index = nextIndex; const step = STEPS[index]; preparePanel();
    number.textContent = `ШАГ ${index + 1} ИЗ ${STEPS.length}`; progress.value = index + 1; title.textContent = step.title; description.textContent = step.text; back.disabled = index === 0;
    next.textContent = index === STEPS.length - 1 ? 'Завершить ✓' : 'Далее →'; title.focus({ preventScroll: true }); reveal();
  }
  function start() {
    if (document.querySelector('dialog[open]')) return;
    stop(); if (index < 0) returnFocus = document.activeElement;
    try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
    tour.hidden = false; document.body.classList.add('video-tour-active'); showStep(0);
  }
  function close() {
    if (index < 0) return;
    clearTarget(); index = -1; tour.hidden = true; document.body.classList.remove('video-tour-active'); document.body.style.removeProperty('--video-tour-space');
    if (frame) cancelAnimationFrame(frame); frame = 0;
    (visible(returnFocus) && returnFocus.matches('button,a[href],input,select,textarea,[tabindex]') ? returnFocus : nav).focus({ preventScroll: true });
  }
  back.addEventListener('click', () => { if (index > 0) showStep(index - 1); }); next.addEventListener('click', () => { if (index === STEPS.length - 1) close(); else if (index >= 0) showStep(index + 1); }); closeButton.addEventListener('click', close);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && index >= 0 && !document.querySelector('dialog[open]')) { event.preventDefault(); close(); } });
  document.querySelector('.rail').addEventListener('click', event => {
    const panel = event.target.closest('[data-panel]')?.dataset.panel; if (!panel || index < 0) return;
    const nextIndex = STEPS.findIndex(step => step.panel === panel); if (nextIndex >= 0) showStep(nextIndex);
  });
  document.addEventListener('video:changed', schedulePosition); window.addEventListener('scroll', schedulePosition, true);
  window.addEventListener('resize', () => { if (index >= 0) { clearTarget(); preparePanel(); reveal(); } }); new ResizeObserver(schedulePosition).observe(tour);
  const nav = create('button'); nav.id = 'video-help'; nav.setAttribute('aria-label', 'Помощь');
  const icon = create('span', '?'); icon.setAttribute('aria-hidden', 'true'); nav.append(icon, document.createTextNode('Помощь')); nav.addEventListener('click', start);
  const rail = document.querySelector('.rail'); rail.insertBefore(nav, rail.querySelector('a'));
  const tip = create('aside', null, 'video-help-tip'); tip.setAttribute('aria-label', 'Быстрый старт'); tip.append(create('strong', 'Ваш первый ролик'), create('p', 'Девять подсказок покажут нужные кнопки прямо в редакторе.'));
  const begin = create('button', 'Показать подсказки', 'primary full'); begin.addEventListener('click', start);
  const guide = create('a', 'Все возможности студии ↗', 'help-manual'); guide.href = 'video-guide.html'; guide.target = '_blank'; guide.rel = 'noopener';
  const dismiss = create('button', 'Скрыть подсказку', 'full subtle'); dismiss.addEventListener('click', () => { tip.hidden = true; try { localStorage.setItem('satucard-video-tip-hidden', '1'); } catch {} });
  try { tip.hidden = localStorage.getItem('satucard-video-tip-hidden') === '1'; } catch {}
  tip.append(begin, guide, dismiss); document.querySelector('[data-library="templates"]').prepend(tip);
  return { startIfNew() { try { if (localStorage.getItem(SEEN_KEY) === '1') return; } catch {} start(); } };
}
