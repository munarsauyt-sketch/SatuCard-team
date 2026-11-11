'use strict';

(() => {
  const isHeic = file => /^image\/hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '');
  const accepts = file => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || isHeic(file);
  let decoder;

  async function convert(file) {
    if (!isHeic(file)) return file;
    // Load the local CSP-compatible decoder only for an actual HEIC selection.
    decoder ||= import('./assets/vendor/heic-to/heic-to.js');
    const { heicTo, isHeic: check } = await decoder;
    if (!await check(file)) throw new Error('Файл не является фотографией HEIC.');
    try {
      const blob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
      return new File([blob], (file.name || 'photo').replace(/\.hei[cf]$/i, '') + '.jpg', { type: 'image/jpeg' });
    } catch (_) {
      throw new Error('Не удалось прочитать HEIC. Экспортируйте фото в JPG и загрузите его снова.');
    }
  }
  window.SATUCARD_PHOTO_IMPORT = { accepts, convert };
})();
