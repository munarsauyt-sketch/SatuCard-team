'use strict';

// Both landing-page previews export the same full-resolution image they display.
window.downloadHomeCard = async (settings, photo, name) => {
  const output = document.createElement('canvas');
  window.SATUCARD_RENDERER.render(output, settings, { photo }, { scale: 1 });
  const blob = await new Promise(resolve => output.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG unavailable');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name + '.png';
  document.body.append(link);
  try { link.click(); }
  finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
};
