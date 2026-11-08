'use strict';

// Portable projects contain data, never executable code or remote image URLs.
(() => {
  const MAX_SOURCE_LENGTH = 8 * 1024 * 1024;
  const MAX_PROJECT_LENGTH = 17 * 1024 * 1024;
  const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
  const onlyKeys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));
  const clone = value => JSON.parse(JSON.stringify(value));

  function createHistory(initial, limit = 40) {
    let entries = [clone(initial)];
    let cursor = 0;
    return {
      push(value) {
        if (JSON.stringify(entries[cursor]) === JSON.stringify(value)) return false;
        entries = entries.slice(0, cursor + 1);
        entries.push(clone(value));
        if (entries.length > limit) entries.shift();
        cursor = entries.length - 1;
        return true;
      },
      undo() { if (cursor > 0) cursor--; return clone(entries[cursor]); },
      redo() { if (cursor < entries.length - 1) cursor++; return clone(entries[cursor]); },
      get canUndo() { return cursor > 0; },
      get canRedo() { return cursor < entries.length - 1; },
      retained() { return clone(entries); }
    };
  }

  function validSource(value) {
    return value === null || (typeof value === 'string' && value.length <= MAX_SOURCE_LENGTH &&
      /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value));
  }

  function parseViews(value, activeViewId, normalize, photoIds) {
    if (value === undefined && !photoIds) return {};
    if (!Array.isArray(value) || value.length < 1 || value.length > 8) throw new Error('Комплект должен содержать от 1 до 8 карточек.');
    const ids = new Set();
    const views = value.map(view => {
      if (!view || typeof view.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(view.id) || ids.has(view.id) ||
          typeof view.label !== 'string' || !view.label.trim() || view.label.length > 60 ||
          !view.settings || typeof view.settings !== 'object' || Array.isArray(view.settings)) throw new Error('Некорректная карточка в комплекте.');
      ids.add(view.id);
      if (photoIds && (!onlyKeys(view, ['id', 'label', 'settings', 'photoIds']) || !Array.isArray(view.photoIds) || view.photoIds.length > 3 || new Set(view.photoIds).size !== view.photoIds.length || !view.photoIds.every(id => photoIds.has(id)))) throw new Error('Некорректные фотографии карточки.');
      return { id: view.id, label: view.label.trim(), settings: normalize(view.settings), ...(photoIds ? { photoIds: [...view.photoIds] } : {}) };
    });
    if (!ids.has(activeViewId)) throw new Error('Не найдена активная карточка комплекта.');
    return { views, activeViewId };
  }

  function parseProject(text, normalize) {
    if (typeof text !== 'string' || text.length > MAX_PROJECT_LENGTH) {
      throw new Error('Файл проекта слишком большой. Максимум 17 МБ.');
    }
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (_) { throw new Error('Файл не содержит корректный проект SatuCard.'); }
    if (parsed?.schemaVersion === 2) {
      if (!onlyKeys(parsed, ['app', 'schemaVersion', 'savedAt', 'settings', 'photos', 'logo', 'views', 'activeViewId']) || parsed.app !== 'SatuCard' || !parsed.settings || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings) || !validSource(parsed.logo)) throw new Error('Неподдерживаемый проект.');
      const photos = parsePhotos(parsed.photos);
      const set = parseViews(parsed.views, parsed.activeViewId, normalize, new Set(photos.map(photo => photo.id)));
      return { settings: set.views.find(view => view.id === set.activeViewId).settings, photos, logo: parsed.logo, ...set };
    }
    if (!parsed || parsed.schemaVersion !== 1 || parsed.app !== 'SatuCard' ||
        !parsed.settings || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings) ||
        !validSource(parsed.photo) || !validSource(parsed.logo)) {
      throw new Error('Неподдерживаемый проект. Используйте файл .satucard.json из редактора.');
    }
    const set = parseViews(parsed.views, parsed.activeViewId, normalize);
    return { settings: set.views?.find(view => view.id === set.activeViewId).settings || normalize(parsed.settings), photo: parsed.photo, logo: parsed.logo, ...set };
  }

  function parsePhotos(value) {
    if (!Array.isArray(value) || value.length > 12) throw new Error('Проект должен содержать не более 12 фотографий.');
    const ids = new Set();
    return value.map(photo => {
      if (!onlyKeys(photo, ['id', 'source']) || !safeId(photo.id) || ids.has(photo.id) || photo.source === null || !validSource(photo.source) || photo.source.split(',')[1].length % 4 !== 0) throw new Error('Некорректная фотография проекта.');
      ids.add(photo.id);
      return { id: photo.id, source: photo.source };
    });
  }

  function serializeProject(settings, photo, logo, set = {}) {
    if (!validSource(logo)) throw new Error('Не удалось сохранить изображения проекта.');
    let payload;
    if (set.photos !== undefined) {
      const photos = parsePhotos(set.photos);
      const normalize = globalThis.SATUCARD_RENDERER?.normalize || clone;
      const views = parseViews(set.views, set.activeViewId, normalize, new Set(photos.map(photo => photo.id)));
      payload = { app: 'SatuCard', schemaVersion: 2, settings: views.views.find(view => view.id === views.activeViewId).settings, photos, logo, ...views };
    } else {
      if (!validSource(photo)) throw new Error('Не удалось сохранить изображения проекта.');
      const views = parseViews(set.views, set.activeViewId, clone);
      payload = { app: 'SatuCard', schemaVersion: 1, savedAt: new Date().toISOString(), settings, photo, logo, ...views };
    }
    const text = JSON.stringify(payload);
    if (text.length > MAX_PROJECT_LENGTH) throw new Error('Файл проекта слишком большой. Максимум 17 МБ.');
    return text;
  }

  async function openDraftDatabase() {
    if (!globalThis.indexedDB) throw new Error('Хранилище недоступно');
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('satucard-studio', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Хранилище занято другой вкладкой'));
    });
  }

  async function draftAction(action, value) {
    const db = await openDraftDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('drafts', action === 'get' ? 'readonly' : 'readwrite');
        const objectStore = tx.objectStore('drafts');
        const request = action === 'get' ? objectStore.get('current') :
          action === 'put' ? objectStore.put(value, 'current') : objectStore.delete('current');
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Сохранение прервано'));
      });
    } finally { db.close(); }
  }

  globalThis.SATUCARD_PROJECT = { createHistory, parseProject, serializeProject, draftAction };
})();
