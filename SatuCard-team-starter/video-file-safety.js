import { DEMOS } from './video-model.js';

export const MAX_FILE = 40 * 1024 * 1024;
export const MAX_TOTAL = 100 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40e6;
export const mediaKind = type => /^(image|video|audio)\//.exec(type || '')?.[1];

export function checkImportQuota(project, files, file) {
  if (!(file instanceof Blob) || !file.size || file.size > MAX_FILE) throw new Error('Один файл — до 40 МБ.');
  if (project.assets.length >= 40) throw new Error('Можно добавить до 40 исходников.');
  const total = [...files.values()].reduce((sum, blob) => sum + blob.size, 0);
  if (total + file.size > MAX_TOTAL) throw new Error('Все исходники проекта — до 100 МБ.');
}

export function checkMediaBundle(project, files) {
  // The cache also keeps sources referenced by undo history; only project.assets
  // has the 40-asset cap. Cached blobs still count towards the byte budget.
  if (!(files instanceof Map)) throw new Error('Некорректные файлы проекта.');
  let total = 0;
  for (const blob of files.values()) {
    if (!(blob instanceof Blob) || !blob.size || blob.size > MAX_FILE) throw new Error('Один файл — до 40 МБ.');
    total += blob.size;
    if (total > MAX_TOTAL) throw new Error('Медиа проекта превышают 100 МБ.');
  }
  for (const asset of project.assets) {
    if (Object.hasOwn(DEMOS,asset.id)) continue;
    const file = files.get(asset.id);
    if (!file || mediaKind(file.type) !== asset.kind) throw new Error('Тип исходника не совпадает с медиа проекта.');
  }
}

// Read dimensions before asking an image decoder to allocate a pixel buffer.
// JPEG metadata is bounded as well; unusually large headers can be re-encoded.
export async function checkImageHeader(file) {
  const data = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const ascii = (at, n) => String.fromCharCode(...data.subarray(at, at + n));
  let width, height;
  if (file.type === 'image/png' && data.length >= 24 && data[0] === 137 && ascii(1, 7) === 'PNG\r\n\x1a\n' && ascii(12, 4) === 'IHDR') {
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (file.type === 'image/jpeg' && data[0] === 255 && data[1] === 216) {
    let at = 2;
    while (at + 8 < data.length) {
      if (data[at++] !== 255) break;
      while (data[at] === 255) at++;
      const marker = data[at++];
      if (marker === 217 || marker === 218 || at + 2 > data.length) break;
      const length = view.getUint16(at);
      if (length < 2 || at + length > data.length) break;
      if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) {
        height = view.getUint16(at + 3); width = view.getUint16(at + 5); break;
      }
      at += length;
    }
  } else if (file.type === 'image/webp' && data.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const kind = ascii(12, 4);
    if (kind === 'VP8X') {
      width = 1 + data[24] + (data[25] << 8) + (data[26] << 16);
      height = 1 + data[27] + (data[28] << 8) + (data[29] << 16);
    } else if (kind === 'VP8L' && data[20] === 47) {
      const bits = view.getUint32(21, true);
      width = (bits & 16383) + 1; height = ((bits >>> 14) & 16383) + 1;
    } else if (kind === 'VP8 ' && ascii(23, 3) === '\x9d\x01\x2a') {
      width = view.getUint16(26, true) & 16383; height = view.getUint16(28, true) & 16383;
    }
  }
  if (!width || !height) throw new Error('Повреждённое изображение или неверный тип файла. Сохраните его как JPG, PNG или WebP.');
  if (width * height > MAX_IMAGE_PIXELS) throw new Error('Изображение слишком большое: до 40 мегапикселей.');
  return { width, height };
}
