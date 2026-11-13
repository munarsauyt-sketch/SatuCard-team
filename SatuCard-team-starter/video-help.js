const STEPS = [
  ['01', 'Выберите настроение', 'Откройте «Шаблоны». В категории «Яркие» — 24 цветных варианта. Перед сменой шаблона скачайте текущий проект: замена перезапишет черновик.', 'templates', 'Шаблоны'],
  ['02', 'Добавьте свой товар', 'В «Медиа» нажмите «Добавить файлы». Под загруженной фотографией выберите «Заменить товар», чтобы обновить все сцены. «＋ В ролик» добавляет отдельный слой.', 'media', 'Медиа'],
  ['03', 'Обновите текст и цену', 'Во вкладке «Бренд» заполните товар, цену, магазин, призыв и три преимущества. Нажмите «Обновить ролик». Отдельный текст меняется через выбор слоя и его свойства.', 'brand', 'Бренд'],
  ['04', 'Проверьте монтаж', 'Нажмите ▶. В «Проекты → Сцены» меняйте порядок целых сцен. На монтажной шкале двигайте слои и тяните их края. Ctrl+Z отменяет правку; на Mac — Cmd+Z.', 'workflow', 'Проекты'],
  ['05', 'Добавьте звук и субтитры', 'В «Звук» добавьте музыку или запишите голос. Запись остаётся на устройстве. В «Текст» можно загрузить SRT/VTT. Платная ИИ-озвучка и распознавание пока выключены.', 'audio', 'Звук'],
  ['06', 'Сохраните и скачайте', 'Сначала скачайте файл проекта для дальнейших правок. Затем: «Экспорт → Собрать MP4 → Скачать MP4». Для экспорта нужен Chrome или Edge с поддержкой H.264/AAC. Проверьте готовый ролик.', null, ''],
];

export function installVideoHelp({ showPanel, stop }) {
  const create = (tag, text, className) => { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; };
  const dialog = create('dialog', null, 'video-help-dialog');
  dialog.id = 'video-help-dialog'; dialog.setAttribute('aria-labelledby', 'video-help-title');
  const top = create('form', null, 'dialog-top'); top.method = 'dialog';
  top.append(create('span', 'РОЛИК ЗА 6 ШАГОВ', 'eyebrow'));
  const close = create('button', '×'); close.setAttribute('aria-label', 'Закрыть инструктаж'); top.append(close);
  const progress = create('progress'); progress.max = STEPS.length; progress.setAttribute('aria-label', 'Прогресс инструктажа');
  const content = create('div'); content.setAttribute('aria-live', 'polite'); content.setAttribute('aria-atomic', 'true');
  const number = create('p', null, 'help-number'), title = create('h2'), description = create('p', null, 'help-description'); title.id = 'video-help-title'; title.tabIndex = -1; title.setAttribute('autofocus', '');
  content.append(number, title, description);
  const show = create('button', null, 'full subtle'); show.type = 'button';
  const actions = create('div', null, 'button-row');
  const back = create('button', 'Назад'), next = create('button', 'Далее', 'primary'); actions.append(back, next);
  const manual = create('a', 'Подробная инструкция ↗', 'help-manual'); manual.href = 'video-guide.html'; manual.target = '_blank'; manual.rel = 'noopener';
  dialog.append(top, progress, content, show, actions, manual); document.body.append(dialog);
  let index = 0;
  const render = () => {
    const [step, heading, text, panel, label] = STEPS[index];
    number.textContent = `${step} / 06`; title.textContent = heading; description.textContent = text;
    progress.value = index + 1; back.disabled = index === 0; next.textContent = index === STEPS.length - 1 ? 'Начать создавать' : 'Далее';
    show.hidden = !panel; show.textContent = panel ? `Открыть «${label}»` : '';
  };
  const start = () => { stop(); index = 0; render(); dialog.showModal(); };
  back.addEventListener('click', () => { if (index > 0) { index--; render(); } });
  next.addEventListener('click', () => { if (index < STEPS.length - 1) { index++; render(); } else dialog.close(); });
  show.addEventListener('click', () => { const panel = STEPS[index][3]; dialog.close(); if (panel) showPanel(panel); });
  const nav = create('button'); nav.id = 'video-help'; nav.setAttribute('aria-label', 'Помощь');
  const icon = create('span', '?'); icon.setAttribute('aria-hidden', 'true'); nav.append(icon, document.createTextNode('Помощь')); nav.addEventListener('click', start);
  const rail = document.querySelector('.rail'); rail.insertBefore(nav, rail.querySelector('a'));
  const tip = create('aside', null, 'video-help-tip'); tip.setAttribute('aria-label', 'Быстрый старт');
  tip.append(create('strong', 'Ваш первый ролик'), create('p', 'Шесть коротких шагов — от фото товара до MP4.'));
  const begin = create('button', 'Быстрый старт', 'primary full'); begin.addEventListener('click', start);
  const guide = create('a', 'Все возможности студии ↗', 'help-manual'); guide.href = 'video-guide.html'; guide.target = '_blank'; guide.rel = 'noopener';
  const dismiss = create('button', 'Скрыть подсказку', 'full subtle');
  dismiss.addEventListener('click', () => { tip.hidden = true; try { localStorage.setItem('satucard-video-tip-hidden', '1'); } catch {} });
  try { tip.hidden = localStorage.getItem('satucard-video-tip-hidden') === '1'; } catch {}
  tip.append(begin, guide, dismiss); document.querySelector('[data-library="templates"]').prepend(tip);
}
