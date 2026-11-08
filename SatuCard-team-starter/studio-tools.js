'use strict';

// Local-only helpers. Background removal is a uniform-colour flood fill, not AI.
(() => {
  const root = typeof window === 'undefined' ? globalThis : window;
  function removeBackground(imageData, width, height, tolerance = 32) {
    const source = imageData?.data || imageData;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 3 || width * height > 16000000 || !source || source.length !== width * height * 4) {
      throw new Error('Нужно изображение от 3×3 до 16 миллионов пикселей в формате RGBA.');
    }
    tolerance = Math.max(0, Math.min(120, Number.isFinite(Number(tolerance)) ? Number(tolerance) : 32));
    const data = new Uint8ClampedArray(source);
    const border = [];
    for (let x = 0; x < width; x++) { border.push(x, (height - 1) * width + x); }
    for (let y = 1; y < height - 1; y++) { border.push(y * width, y * width + width - 1); }
    const opaque = border.filter(p => data[p * 4 + 3] > 24);
    if (!opaque.length) throw new Error('Края уже прозрачные. Используйте исходное фото с однотонным фоном.');
    // Channel medians resist small objects touching an otherwise plain border.
    const background = [0, 1, 2].map(c => opaque.map(p => data[p * 4 + c]).sort((a, b) => a - b)[Math.floor(opaque.length / 2)]);
    const distance = p => Math.sqrt(background.reduce((sum, c, channel) => sum + (data[p * 4 + channel] - c) ** 2, 0) / 3);
    if (opaque.filter(p => distance(p) <= Math.max(tolerance, 12)).length / opaque.length < 0.8) {
      throw new Error('Фон у краёв неоднородный. Выберите фото на однотонном фоне: локальный инструмент не отделяет сложный фон.');
    }
    const count = width * height;
    const seen = new Uint8Array(count);
    const queue = new Uint32Array(count);
    let head = 0, tail = 0, removedPixels = 0;
    function enqueue(p) {
      if (seen[p]) return;
      seen[p] = 1;
      if (data[p * 4 + 3] <= 24 || distance(p) <= tolerance) queue[tail++] = p;
    }
    border.forEach(enqueue);
    while (head < tail) {
      const p = queue[head++];
      if (data[p * 4 + 3] > 0) removedPixels++;
      data[p * 4 + 3] = 0;
      if (p % width) enqueue(p - 1);
      if (p % width < width - 1) enqueue(p + 1);
      if (p >= width) enqueue(p - width);
      if (p < count - width) enqueue(p + width);
    }
    if (!removedPixels) throw new Error('Фон не найден. Немного увеличьте допуск или выберите другое фото.');
    if (tail >= count * 0.98) throw new Error('Почти всё изображение совпало с фоном. Уменьшите допуск или используйте контрастное фото.');
    return { data, width, height, removedPixels, background, warning: 'Проверьте края и светлые детали товара. Это локальное удаление однотонного фона, не ИИ.' };
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  // Stored ZIP entries with UTF-8 names, standard CRC32, and deterministic date.
  function createZip(files) {
    if (!Array.isArray(files) || files.length > 65535) throw new Error('Слишком много файлов для ZIP.');
    const encoder = new TextEncoder();
    const names = new Set();
    const entries = files.map(file => {
      const name = String(file.name || '');
      if (!name || name.startsWith('/') || /[\\\u0000-\u001f]/.test(name) || name.split('/').some(part => !part || part === '..' || part === '.') || names.has(name)) throw new Error('Некорректное или повторяющееся имя файла ZIP.');
      names.add(name);
      const encoded = encoder.encode(name);
      if (encoded.length > 65535 || !(file.bytes instanceof Uint8Array)) throw new Error('ZIP ожидает короткое имя и Uint8Array.');
      return { name: encoded, bytes: file.bytes, crc: crc32(file.bytes) };
    });
    const localSize = entries.reduce((sum, f) => sum + 30 + f.name.length + f.bytes.length, 0);
    const centralSize = entries.reduce((sum, f) => sum + 46 + f.name.length, 0);
    if (localSize + centralSize + 22 > 0xffffffff) throw new Error('ZIP превышает поддерживаемый размер 4 ГБ.');
    const output = new Uint8Array(localSize + centralSize + 22);
    const view = new DataView(output.buffer);
    const u16 = (offset, value) => view.setUint16(offset, value, true);
    const u32 = (offset, value) => view.setUint32(offset, value, true);
    let pos = 0;
    for (const entry of entries) {
      entry.offset = pos;
      u32(pos, 0x04034b50); u16(pos + 4, 20); u16(pos + 6, 0x800); u16(pos + 12, 33);
      u32(pos + 14, entry.crc); u32(pos + 18, entry.bytes.length); u32(pos + 22, entry.bytes.length); u16(pos + 26, entry.name.length);
      output.set(entry.name, pos + 30); output.set(entry.bytes, pos + 30 + entry.name.length);
      pos += 30 + entry.name.length + entry.bytes.length;
    }
    for (const entry of entries) {
      u32(pos, 0x02014b50); u16(pos + 4, 20); u16(pos + 6, 20); u16(pos + 8, 0x800); u16(pos + 14, 33);
      u32(pos + 16, entry.crc); u32(pos + 20, entry.bytes.length); u32(pos + 24, entry.bytes.length); u16(pos + 28, entry.name.length); u32(pos + 42, entry.offset);
      output.set(entry.name, pos + 46); pos += 46 + entry.name.length;
    }
    u32(pos, 0x06054b50); u16(pos + 8, entries.length); u16(pos + 10, entries.length); u32(pos + 12, centralSize); u32(pos + 16, localSize);
    return output;
  }

  const presets = {
    general: { label: 'Общие рекомендации', ratio: null, suggested: 'от 900 пикселей по короткой стороне' },
    kaspi: { label: 'Kaspi', ratio: 1, suggested: 'квадрат 1:1, например 900×900' },
    wildberries: { label: 'Wildberries', ratio: 0.75, suggested: 'вертикальный 3:4, например 900×1200' },
    ozon: { label: 'Ozon', ratio: 0.75, suggested: 'вертикальный 3:4, например 900×1200' }
  };
  function preflight(settings = {}, metadata = {}, marketplace = 'general') {
    const key = Object.hasOwn(presets, marketplace) ? marketplace : 'general';
    const preset = presets[key];
    const checks = [];
    const add = (id, severity, message) => checks.push({ id, severity, message });
    const { width, height, bytes, mime, photoWidth, photoHeight, hasPhoto, hasLogo } = metadata;
    const validDimensions = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
    add('dimensions', !validDimensions ? 'error' : Math.min(width, height) < 900 ? 'warning' : 'pass', !validDimensions ? 'Не удалось определить размер экспорта.' : `Размер: ${width}×${height}. Рекомендация для макета: ${preset.suggested}.`);
    if (validDimensions && preset.ratio) add('aspect', Math.abs(width / height - preset.ratio) > 0.025 ? 'warning' : 'pass', `Предлагаемый формат для ${preset.label}: ${preset.suggested}. Уточните требования категории.`);
    add('file-size', !Number.isFinite(bytes) || bytes <= 0 ? 'warning' : bytes > 10 * 1024 * 1024 ? 'warning' : 'pass', !Number.isFinite(bytes) || bytes <= 0 ? 'Размер файла станет известен после экспорта.' : `Файл: ${(bytes / 1024 / 1024).toFixed(2)} МБ.${bytes > 10 * 1024 * 1024 ? ' Большой файл: проверьте лимит площадки или уменьшите изображение.' : ' Сверьте с лимитом выбранной категории.'}`);
    add('mime', !mime ? 'info' : ['image/png', 'image/jpeg'].includes(mime) ? 'pass' : 'warning', `Формат: ${mime || 'ещё не определён'}. Проверяйте поддержку формата площадкой.`);
    if (!hasPhoto) add('photo', 'error', 'Добавьте фотографию товара: сейчас в макете нет загруженного товара.');
    else if (!(photoWidth > 0 && photoHeight > 0)) add('photo-resolution', 'warning', 'Не удалось проверить разрешение исходного фото.');
    else add('photo-resolution', validDimensions && (photoWidth < width * 0.65 || photoHeight < height * 0.65) ? 'warning' : 'pass', `Исходное фото: ${photoWidth}×${photoHeight}. Проверьте резкость при масштабе 100%: увеличение и обрезка могут снизить качество.`);
    if (settings.showPrice !== false && settings.price !== null && settings.price !== undefined && settings.price !== '') add('price', 'warning', 'Цена на изображении может устареть или быть запрещена правилами категории. Для главного фото рассмотрите вариант без цены.');
    if (settings.badge) add('badge', 'warning', 'Проверьте допустимость плашек, скидок и рекламных обещаний на главном фото.');
    if (settings.showBrand !== false && (settings.brandName || hasLogo)) add('brand', 'warning', 'Убедитесь, что имеете право на бренд/логотип и площадка допускает его размещение.');
    if ((settings.title || '').length > 45 || (settings.description || '').length > 120 || (settings.features || []).some(value => String(value).length > 32)) add('text', 'warning', 'Много текста: проверьте переносы, обрезку и читаемость в мобильном превью.');
    add('category-review', 'info', 'Это рекомендации по подготовке, не официальная проверка и не гарантия приёма. Перед загрузкой проверьте действующие правила площадки и категории, фон, кадрирование и достоверность описания.');
    return { marketplace: key, label: preset.label, disclaimer: 'Рекомендации, а не официальные требования маркетплейса.', checks, ok: !checks.some(check => check.severity === 'error') };
  }
  root.SATUCARD_TOOLS = { removeBackground, createZip, crc32, preflight, presets };
})();
