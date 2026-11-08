import { AccountError } from './account.js';

// Includes the JSON envelope, below Vercel's 4.5 MB request/response ceiling.
export const MAX_PROJECT_BYTES = 3_500_000;
export const projectId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const string = (value, max) => typeof value === 'string' && value.length <= max;
const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const invalid = () => new AccountError('Неверный формат проекта SatuCard.', 400, 'invalid_project');
const textFields = { title: 60, subtitle: 90, description: 180, badge: 24, brandName: 28 };
const enums = { template: ['studio', 'accent', 'minimal', 'noir', 'neon', 'editorial', 'bloom', 'bold'], format: ['portrait', 'portrait34', 'square', 'story'], purpose: ['cover', 'advantages', 'dimensions', 'specifications', 'contents', 'instructions'], category: ['generic', 'electronics', 'clothing', 'beauty', 'home'], font: ['manrope', 'dejavu'], textAlign: ['left', 'center'] };
const photoRanges = { zoom: [0.7, 2.5], x: [0, 100], y: [0, 100], rotation: [-180, 180], brightness: [50, 150], contrast: [50, 150], saturation: [0, 180], radius: [0, 50] };
function settings(value) {
  if (!keys(value, [...Object.keys(textFields), ...Object.keys(enums), 'price', 'oldPrice', 'features', 'customColors', 'background', 'accent', 'textColor', 'textScale', 'showPrice', 'showBrand', 'photo'])) return false;
  return Object.entries(value).every(([key, field]) => {
    if (key in textFields) return string(field, textFields[key]);
    if (key in enums) return enums[key].includes(field);
    if (['price', 'oldPrice'].includes(key)) return field === null || number(field, 0, 999999999.99);
    if (['customColors', 'showPrice', 'showBrand'].includes(key)) return typeof field === 'boolean';
    if (['background', 'accent', 'textColor'].includes(key)) return typeof field === 'string' && /^#[0-9a-f]{6}$/i.test(field);
    if (key === 'textScale') return number(field, 80, 120);
    if (key === 'features') return Array.isArray(field) && field.length <= 3 && field.every(item => string(item, 38));
    if (key === 'photo') return keys(field, [...Object.keys(photoRanges), 'fit', 'flip']) && Object.entries(field).every(([name, val]) => name === 'fit' ? ['cover', 'contain'].includes(val) : name === 'flip' ? typeof val === 'boolean' : number(val, ...photoRanges[name]));
    return false;
  });
}
function raster(value) {
  if (value === null) return true;
  if (typeof value !== 'string' || value.length > 8 * 1024 * 1024) return false;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.toString('base64') !== match[2]) return false;
  if (match[1] === 'png') return bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii', 12, 16) === 'IHDR';
  if (match[1] === 'jpeg') return bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}
export function validateProject(value) {
  const v2 = value?.schemaVersion === 2;
  if (!keys(value, ['app', 'schemaVersion', 'savedAt', 'settings', v2 ? 'photos' : 'photo', 'logo', 'views', 'activeViewId']) || value.app !== 'SatuCard' || ![1, 2].includes(value.schemaVersion) || !settings(value.settings) || (!v2 && !raster(value.photo)) || !raster(value.logo)) throw invalid();
  const photoIds = new Set();
  if (v2) {
    if (!Array.isArray(value.photos) || value.photos.length > 12 || value.views === undefined) throw invalid();
    for (const photo of value.photos) {
      if (!keys(photo, ['id', 'source']) || !string(photo.id, 64) || !/^[a-zA-Z0-9_-]+$/.test(photo.id) || photoIds.has(photo.id) || photo.source === null || !raster(photo.source)) throw invalid();
      photoIds.add(photo.id);
    }
  }
  if (value.savedAt !== undefined && (!string(value.savedAt, 40) || !Number.isFinite(Date.parse(value.savedAt)))) throw invalid();
  if (value.views !== undefined) {
    if (!Array.isArray(value.views) || value.views.length < 1 || value.views.length > 8) throw invalid();
    const ids = new Set();
    for (const view of value.views) {
      if (!keys(view, v2 ? ['id', 'label', 'settings', 'photoIds'] : ['id', 'label', 'settings']) || !string(view.id, 64) || !/^[a-zA-Z0-9_-]+$/.test(view.id) || ids.has(view.id) || !string(view.label, 60) || !view.label.trim() || !settings(view.settings)) throw invalid();
      if (v2 && (!Array.isArray(view.photoIds) || view.photoIds.length > 3 || new Set(view.photoIds).size !== view.photoIds.length || !view.photoIds.every(id => photoIds.has(id)))) throw invalid();
      ids.add(view.id);
    }
    if (!ids.has(value.activeViewId)) throw invalid();
  } else if (value.activeViewId !== undefined) throw invalid();
  return value;
}
export async function readProjectBody(request) {
  const oversized = () => new AccountError('Облачный проект должен быть меньше 3,5 МБ. Сохраните файл на устройство или уменьшите фото.', 413, 'project_too_large');
  if (Number(request.headers.get('content-length')) > MAX_PROJECT_BYTES) throw oversized();
  const reader = request.body?.getReader();
  if (!reader) throw invalid();
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_PROJECT_BYTES) { await reader.cancel(); throw oversized(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw invalid(); }
}
