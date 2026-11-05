'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const panel = $('editor-tour'), start = $('start-tour');
  if (!panel || !start) return;

  const steps = [
    { tab: 'photo', target: '#drop-zone', title: 'Начните с фотографии', text: 'Выберите JPG, PNG или WebP до 10 МБ. Для тренировки можно оставить готовый пример или выбрать другой под загрузкой. Масштаб и положение фото меняются ниже.' },
    { tab: 'content', target: '#product-name', title: 'Расскажите о товаре', text: 'Во вкладке «Тексты» введите название. Ниже можно добавить подзаголовок, описание и три преимущества. Пишите только те характеристики, которые есть у товара.' },
    { tab: 'content', target: '.studio-price-grid', title: 'Укажите цену в тенге', text: 'Введите текущую цену. Поле «До скидки» необязательно: старая цена должна быть выше новой. Переключатель ниже позволяет скрыть цену на карточке.' },
    { tab: 'design', target: '#template-grid', title: 'Выберите характер карточки', text: 'Нажмите на один из восьми шаблонов. Предпросмотр изменится сразу. Цвета и шрифт настраиваются ниже; название магазина и логотип — во вкладке «Тексты», в блоке «Бренд вашего магазина».' },
    { tab: 'design', target: '#card-format', title: 'Подберите формат', text: 'Лента 4:5 — 900 × 1125, квадрат 1:1 — 900 × 900, история 9:16 — 900 × 1600. После смены формата проверьте, как расположились фото и текст.' },
    { target: '#download-button', title: 'Скачайте готовое изображение', text: 'Выберите PNG или JPEG и размер 1× или 2× рядом с кнопкой скачивания. Файл попадёт в загрузки браузера. Для этого аккаунт не нужен. Проверьте цену и читаемость перед экспортом.' },
    { target: '#save-project-button', title: 'Оставьте возможность вернуться', text: '«Сохранить проект» скачивает файл .satucard.json с фото, логотипом и настройками. Кнопка «Открыть» загрузит его обратно. Локальный черновик — дополнительная копия в этом браузере, а не в аккаунте.' },
    { target: '#publish-button', title: 'Поделитесь ссылкой', text: 'Для публикации войдите в аккаунт и завершите профиль. После нажатия «Опубликовать» появится публичная ссылка, а карточка — в кабинете. На сервер сохраняется готовое изображение; для дальнейших правок сохраните файл проекта.' }
  ];
  let index = -1, target = null, returnFocus = null, switchingTab = false;
  const welcome = $('tour-welcome');
  const storageKey = 'satucard-tutorial-v1';
  function remember(value) { try { localStorage.setItem(storageKey, value); } catch (_) { /* Обучение доступно и без хранилища. */ } }
  function clearHighlight() { target?.classList.remove('tour-target'); target = null; }
  function position() {
    if (index < 0) return;
    document.body.style.setProperty('--tour-space', `${panel.offsetHeight + 32}px`);
    const rect = target?.getBoundingClientRect();
    panel.classList.toggle('tour-on-left', Boolean(rect && rect.left > window.innerWidth / 2));
  }
  function revealTarget() {
    if (!target) return;
    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    position();
    // On a small screen, keep the highlighted control above the help card.
    if (window.innerWidth <= 700) {
      const bottom = panel.getBoundingClientRect().top - 20;
      let rect = target.getBoundingClientRect();
      for (let parent = target.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (parent.scrollHeight > parent.clientHeight && /(auto|scroll)/.test(getComputedStyle(parent).overflowY)) {
          parent.scrollTop += Math.max(0, rect.bottom - bottom);
          rect = target.getBoundingClientRect();
        }
      }
      if (rect.bottom > bottom) window.scrollBy({ top: rect.bottom - bottom, behavior: 'instant' });
    }
  }
  function showStep(next) {
    clearHighlight(); index = next;
    const step = steps[index];
    if (step.tab) {
      switchingTab = true;
      $(`tab-${step.tab}`).click();
      switchingTab = false;
    }
    target = document.querySelector(step.target);
    target?.classList.add('tour-target');
    $('tour-progress').textContent = `ШАГ ${index + 1} ИЗ ${steps.length}`;
    $('tour-meter-fill').style.width = `${(index + 1) / steps.length * 100}%`;
    $('tour-title').textContent = step.title;
    $('tour-description').textContent = step.text;
    $('tour-prev').disabled = index === 0;
    $('tour-next').textContent = index === steps.length - 1 ? 'Завершить ✓' : 'Далее →';
    $('tour-title').focus({ preventScroll: true });
    requestAnimationFrame(revealTarget);
  }
  function begin() {
    if ($('editor-form').dataset.editorReady !== 'true') return;
    returnFocus = document.activeElement;
    welcome.hidden = true; panel.hidden = false;
    document.body.classList.add('tour-active');
    showStep(0);
  }
  function close(completed = false) {
    if (index < 0) return;
    clearHighlight(); index = -1; panel.hidden = true;
    document.body.classList.remove('tour-active');
    document.body.style.removeProperty('--tour-space');
    if (completed) {
      remember('completed');
      window.satucardToast?.('Вы познакомились с редактором. Обучение можно открыть снова.');
    } else remember('dismissed');
    const canRestoreFocus = returnFocus?.matches('button,a[href],input,select,textarea,[tabindex]') && !returnFocus.closest('[hidden]');
    (canRestoreFocus ? returnFocus : start).focus({ preventScroll: true });
  }
  start.addEventListener('click', begin);
  $('welcome-start-tour').addEventListener('click', begin);
  $('dismiss-tour-welcome').addEventListener('click', () => { welcome.hidden = true; remember('dismissed'); start.focus(); });
  $('tour-close').addEventListener('click', () => close());
  $('tour-prev').addEventListener('click', () => { if (index > 0) showStep(index - 1); });
  $('tour-next').addEventListener('click', () => { if (index === steps.length - 1) close(true); else if (index >= 0) showStep(index + 1); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && index >= 0 && !document.querySelector('dialog[open]')) { event.preventDefault(); close(); }
  });
  document.querySelectorAll('[data-editor-tab]').forEach(button => button.addEventListener('click', () => {
    if (index >= 0 && !switchingTab) showStep(steps.findIndex(step => step.tab === button.dataset.editorTab));
  }));
  window.addEventListener('resize', position);
  function ready() {
    start.hidden = false; $('welcome-start-tour').disabled = false;
    let seen = false;
    try { seen = Boolean(localStorage.getItem(storageKey)); } catch (_) { /* Показываем приглашение без сохранения. */ }
    welcome.hidden = seen;
    const url = new URL(location.href);
    if (url.searchParams.get('tour') === '1') {
      url.searchParams.delete('tour');
      try { history.replaceState(history.state, '', url.href); } catch (_) { /* file:// может ограничивать изменение адреса. */ }
      begin();
    }
  }
  if ($('editor-form').dataset.editorReady === 'true') ready();
  else document.addEventListener('satucard:editor-ready', ready, { once: true });
})();
