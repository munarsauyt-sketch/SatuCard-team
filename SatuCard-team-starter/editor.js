'use strict';

// Всё выполняется локально. Пользовательские фотографии никуда не отправляются.
(() => {
  const form = document.querySelector('#editor-form');
  const nameInput = document.querySelector('#product-name');
  const priceInput = document.querySelector('#product-price');
  const oldPriceInput = document.querySelector('#old-price');
  const oldPriceError = document.querySelector('#old-price-error');
  const fileInput = document.querySelector('#photo-input');
  const fileStatus = document.querySelector('#file-status');
  const priceError = document.querySelector('#price-error');
  const downloadStatus = document.querySelector('#download-status');
  const downloadButton = document.querySelector('#download-button');
  const canvas = document.querySelector('#product-canvas');
  const ctx = canvas.getContext('2d');
  const positionControls = document.querySelector('#photo-position-controls');
  const positionX = document.querySelector('#photo-position-x');
  const positionY = document.querySelector('#photo-position-y');
  const formatDescription = document.querySelector('#format-description');
  const samples = {
    headphones: { name: 'Беспроводные наушники', price: '24990' },
    sneaker: { name: 'Кроссовки Daily', price: '32500' },
    skincare: { name: 'Сыворотка для лица', price: '8900' }
  };
  const themes = {
    studio: { background: '#dfe4d4', ink: '#272c25', photo: '#f4f5ef', tag: '#272c25', tagText: '#ffffff', label: 'ПРОСТО. СО ВКУСОМ.' },
    accent: { background: '#f5b69a', ink: '#3d281f', photo: '#ffe6d9', tag: '#3d281f', tagText: '#ffffff', label: 'В ЦЕНТРЕ ВНИМАНИЯ.' },
    minimal: { background: '#f8f8f5', ink: '#282925', photo: '#eeeeea', tag: '#282925', tagText: '#ffffff', label: 'НИЧЕГО ЛИШНЕГО.' }
  };
  const formatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  const layouts = {
    portrait: { height: 1125, titleTop: 135, titleSize: 64, photoTop: 380, photoHeight: 535, footerTop: 975, priceTop: 965, label: '4:5 · 900 × 1125', file: '4x5' },
    square: { height: 900, titleTop: 112, titleSize: 52, photoTop: 315, photoHeight: 380, footerTop: 756, priceTop: 746, label: '1:1 · 900 × 900', file: '1x1' }
  };
  let photo = null;
  let loadingVersion = 0;
  let captionTimer;
  let style = 'studio';
  let format = 'portrait';
  let photoFit = 'contain';
  let exportVersion = 0;
  let exportUrl = '';

  function setDownloadDisabled(disabled) {
    downloadButton.setAttribute('aria-disabled', String(disabled));
    downloadButton.tabIndex = disabled ? -1 : 0;
  }

  function readPrice() {
    const value = priceInput.value.replace(/\s/g, '').replace(',', '.');
    const valid = value === '' || (/^\d{1,9}(\.\d{0,2})?$/.test(value) && Number(value) <= 999999999.99);
    priceError.textContent = valid ? '' : 'Введите цену от 0 до 999 999 999,99 ₸.';
    priceInput.setAttribute('aria-invalid', String(!valid));
    return { valid, value: !value || !valid ? null : Number(value), text: !value || !valid ? 'Цена в ₸' : `${formatter.format(Number(value))} ₸` };
  }
  function readOldPrice(currentPrice) {
    const value = oldPriceInput.value.replace(/\s/g, '').replace(',', '.');
    const amountValid = value === '' || (/^\d{1,9}(\.\d{0,2})?$/.test(value) && Number(value) <= 999999999.99);
    const greaterThanCurrent = value === '' || currentPrice.value === null || Number(value) > currentPrice.value;
    const valid = amountValid && greaterThanCurrent;
    oldPriceError.textContent = !amountValid ? 'Введите старую цену от 0 до 999 999 999,99 ₸.' : !greaterThanCurrent ? 'Старая цена должна быть выше текущей.' : '';
    oldPriceInput.setAttribute('aria-invalid', String(!valid));
    if (!value || !valid || currentPrice.value === null) return { valid, value: null, text: '', discount: '' };
    const amount = Number(value);
    const percent = Math.round((1 - currentPrice.value / amount) * 100);
    return { valid, value: amount, text: `${formatter.format(amount)} ₸`, discount: percent < 1 ? 'СКИДКА <1%' : `СКИДКА -${percent}%` };
  }
  function resetPhotoControls() {
    photoFit = 'contain';
    document.querySelector('input[name="photo-fit"][value="contain"]').checked = true;
    positionX.value = '50'; positionY.value = '50';
    positionControls.hidden = true;
    document.querySelector('#photo-position-x-value').value = '50%';
    document.querySelector('#photo-position-y-value').value = '50%';
  }
  function roundRect(x, y, w, h, radius, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
  }
  function wrappedLines(text, maxWidth, fontSize) {
    ctx.font = `650 ${fontSize}px Manrope, Arial, sans-serif`;
    const lines = []; let line = '';
    for (const char of text) {
      if (ctx.measureText(line + char).width > maxWidth && line) {
        const lastSpace = line.lastIndexOf(' ');
        if (lastSpace > line.length / 2) { lines.push(line.slice(0, lastSpace)); line = line.slice(lastSpace + 1) + char; }
        else { lines.push(line); line = char; }
      } else line += char;
    }
    if (line) lines.push(line.trim());
    return lines;
  }
  function render() {
    const theme = themes[style];
    const layout = layouts[format];
    const title = nameInput.value.trim() || 'Название вашего товара';
    const price = readPrice();
    const oldPrice = readOldPrice(price);
    document.querySelector('#name-count').textContent = `${nameInput.value.length} / 60`;
    if (canvas.height !== layout.height) canvas.height = layout.height;
    formatDescription.textContent = layout.label;
    ctx.clearRect(0, 0, 900, layout.height);
    ctx.fillStyle = theme.background; ctx.fillRect(0, 0, 900, layout.height);
    ctx.fillStyle = theme.ink; ctx.textBaseline = 'top';
    ctx.font = '750 23px Manrope, Arial, sans-serif'; ctx.fillText('SatuCard.', 60, 48);
    ctx.textAlign = 'right'; ctx.font = '500 16px Manrope, Arial, sans-serif'; ctx.fillText(theme.label, 840, 54); ctx.textAlign = 'left';
    let fontSize = layout.titleSize, lines = wrappedLines(title, 780, fontSize);
    while (lines.length > 3 && fontSize > 36) { fontSize -= 2; lines = wrappedLines(title, 780, fontSize); }
    ctx.font = `650 ${fontSize}px Manrope, Arial, sans-serif`;
    lines.forEach((line, i) => ctx.fillText(line.trim(), 60, layout.titleTop + i * fontSize * 1.14));
    const top = layout.photoTop, width = 780, height = layout.photoHeight;
    roundRect(60, top, width, height, style === 'minimal' ? 0 : 16, theme.photo);
    if (photo) {
      const scale = photoFit === 'cover' ? Math.max(width / photo.naturalWidth, height / photo.naturalHeight) : Math.min(width / photo.naturalWidth, height / photo.naturalHeight);
      const w = photo.naturalWidth * scale, h = photo.naturalHeight * scale;
      positionX.disabled = photoFit !== 'cover' || w <= width + 1;
      positionY.disabled = photoFit !== 'cover' || h <= height + 1;
      const x = photoFit === 'cover' ? Number(positionX.value) / 100 : 0.5;
      const y = photoFit === 'cover' ? Number(positionY.value) / 100 : 0.5;
      ctx.save(); ctx.beginPath(); ctx.roundRect(60, top, width, height, style === 'minimal' ? 0 : 16); ctx.clip();
      ctx.drawImage(photo, 60 + (width - w) * x, top + (height - h) * y, w, h); ctx.restore();
    } else { positionX.disabled = true; positionY.disabled = true; }
    ctx.fillStyle = theme.ink; ctx.font = '500 16px Manrope, Arial, sans-serif'; ctx.fillText('ВАШ НОВЫЙ ВЫБОР', 60, layout.footerTop);
    ctx.font = '500 19px Manrope, Arial, sans-serif'; ctx.fillText('В деталях — характер.', 60, layout.footerTop + 33);
    if (oldPrice.value !== null) {
      ctx.font = '700 17px Manrope, Arial, sans-serif';
      const discountWidth = ctx.measureText(oldPrice.discount).width + 32;
      roundRect(60, layout.priceTop - 42, discountWidth, 30, 6, theme.tag);
      ctx.fillStyle = theme.tagText; ctx.textBaseline = 'middle';
      ctx.fillText(oldPrice.discount, 76, layout.priceTop - 27); ctx.textBaseline = 'top';
      ctx.fillStyle = theme.ink; ctx.textAlign = 'right'; ctx.font = '500 24px Manrope, Arial, sans-serif';
      ctx.fillText(oldPrice.text, 840, layout.priceTop - 38);
      const oldWidth = ctx.measureText(oldPrice.text).width;
      ctx.lineWidth = 2; ctx.strokeStyle = theme.ink; ctx.beginPath();
      ctx.moveTo(840 - oldWidth, layout.priceTop - 25); ctx.lineTo(840, layout.priceTop - 25); ctx.stroke();
      ctx.textAlign = 'left';
    }
    let priceSize = 35;
    ctx.font = `700 ${priceSize}px Manrope, Arial, sans-serif`;
    while (ctx.measureText(price.text).width > 390 && priceSize > 25) { priceSize--; ctx.font = `700 ${priceSize}px Manrope, Arial, sans-serif`; }
    const badgeWidth = ctx.measureText(price.text).width + 48;
    roundRect(840 - badgeWidth, layout.priceTop, badgeWidth, 78, 11, theme.tag);
    ctx.fillStyle = theme.tagText; ctx.textBaseline = 'middle'; ctx.fillText(price.text, 864 - badgeWidth, layout.priceTop + 39); ctx.textBaseline = 'top';
    canvas.setAttribute('aria-label', `Карточка товара: ${title}. ${price.text}.${oldPrice.value !== null ? ` Старая цена ${oldPrice.text}, ${oldPrice.discount}.` : ''} Стиль: ${style === 'studio' ? 'Студия' : style === 'accent' ? 'Акцент' : 'Минимал'}. Формат ${layout.label}.`);
    clearTimeout(captionTimer);
    captionTimer = setTimeout(() => { document.querySelector('#preview-caption').textContent = canvas.getAttribute('aria-label'); }, 400);
    const version = ++exportVersion;
    setDownloadDisabled(true);
    if (!photo || !price.valid || !oldPrice.valid || !nameInput.value.trim() || !priceInput.value.trim()) return;
    canvas.toBlob(blob => {
      if (version !== exportVersion || !blob) return;
      if (exportUrl) URL.revokeObjectURL(exportUrl);
      exportUrl = URL.createObjectURL(blob);
      downloadButton.href = exportUrl;
      downloadButton.download = `satucard-${style}-${layout.file}.png`;
      setDownloadDisabled(false);
    }, 'image/png');
  }
  function loadPhoto(source, successText, selectedSample = '') {
    const version = ++loadingVersion;
    setDownloadDisabled(true);
    fileStatus.textContent = 'Загружаем фотографию…'; fileStatus.classList.remove('error');
    const image = new Image();
    image.onload = () => {
      if (version !== loadingVersion) return;
      photo = image;
      resetPhotoControls();
      fileStatus.textContent = successText;
      document.querySelectorAll('[data-sample]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sample === selectedSample)));
      downloadStatus.textContent = ''; render();
    };
    image.onerror = () => {
      if (version !== loadingVersion) return;
      fileStatus.textContent = 'Не удалось прочитать фото. Выберите другой JPG, PNG или WebP.';
      fileStatus.classList.add('error'); render();
    };
    image.src = source;
  }
  function selectSample(key) {
    const sample = samples[key] || samples.headphones;
    const safeKey = samples[key] ? key : 'headphones';
    nameInput.value = sample.name; priceInput.value = sample.price; oldPriceInput.value = '';
    fileInput.value = '';
    loadPhoto(window.SATUCARD_DEMO_IMAGES[safeKey], 'Используется фото из примера. Можно загрузить своё.', safeKey);
  }
  function upload(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      fileStatus.textContent = 'Этот формат не поддерживается. Выберите JPG, PNG или WebP.'; fileStatus.classList.add('error'); fileInput.value = ''; return;
    }
    if (file.size > 10 * 1024 * 1024) {
      fileStatus.textContent = 'Файл больше 10 МБ. Выберите фотографию поменьше.'; fileStatus.classList.add('error'); fileInput.value = ''; return;
    }
    const version = ++loadingVersion;
    const reader = new FileReader();
    reader.onload = () => { if (version === loadingVersion) loadPhoto(reader.result, `Загружено: ${file.name}`); };
    reader.onerror = () => { if (version === loadingVersion) { fileStatus.textContent = 'Не удалось открыть файл. Попробуйте ещё раз.'; fileStatus.classList.add('error'); } };
    reader.readAsDataURL(file);
  }
  form.addEventListener('submit', event => event.preventDefault());
  [nameInput, priceInput, oldPriceInput].forEach(input => input.addEventListener('input', () => { downloadStatus.textContent = ''; render(); }));
  document.querySelectorAll('input[name="style"]').forEach(input => input.addEventListener('change', () => { style = input.value; downloadStatus.textContent = ''; render(); }));
  document.querySelectorAll('input[name="photo-fit"]').forEach(input => input.addEventListener('change', () => {
    photoFit = input.value;
    positionControls.hidden = photoFit !== 'cover';
    downloadStatus.textContent = ''; render();
  }));
  [positionX, positionY].forEach(input => input.addEventListener('input', () => {
    document.querySelector(`#${input.id}-value`).value = `${input.value}%`;
    downloadStatus.textContent = ''; render();
  }));
  document.querySelectorAll('input[name="card-format"]').forEach(input => input.addEventListener('change', () => {
    format = input.value;
    downloadStatus.textContent = ''; render();
  }));
  document.querySelectorAll('[data-sample]').forEach(button => button.addEventListener('click', () => selectSample(button.dataset.sample)));
  fileInput.addEventListener('change', () => upload(fileInput.files[0]));
  const dropZone = document.querySelector('#drop-zone');
  ['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.remove('drag-over'); }));
  dropZone.addEventListener('drop', event => upload(event.dataTransfer.files[0]));
  // Не даём браузеру открыть перетащенный файл вместо сайта.
  window.addEventListener('dragover', event => event.preventDefault());
  window.addEventListener('drop', event => event.preventDefault());
  document.querySelector('#reset-button').addEventListener('click', () => {
    form.reset(); style = 'studio'; format = 'portrait'; resetPhotoControls();
    downloadStatus.textContent = ''; selectSample('headphones');
  });
  downloadButton.addEventListener('click', event => {
    if (downloadButton.getAttribute('aria-disabled') === 'true') { event.preventDefault(); return; }
    downloadStatus.textContent = 'Карточка PNG подготовлена. Проверьте загрузки браузера.';
  });
  const params = new URLSearchParams(window.location.search);
  if (Object.hasOwn(themes, params.get('style'))) style = params.get('style');
  document.querySelector(`input[value="${style}"]`).checked = true;
  selectSample(Object.hasOwn(samples, params.get('sample')) ? params.get('sample') : 'headphones');
  document.fonts.ready.then(render);
})();
