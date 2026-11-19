const supported = new Set(['Golos Text', 'Manrope', 'Noto Serif', 'IBM Plex Mono']);
const requests = new Map();

// Only load faces actually used by the current composition. Export awaits them
// too, so a fast click cannot burn fallback glyphs into the finished video.
export async function loadProjectFonts(project) {
  if (!globalThis.document?.fonts) return;
  const faces = new Set(project.layers.filter(item => ['text', 'subtitles'].includes(item.type) && !item.hidden)
    .map(item => `${item.weight || 700} 30px "${supported.has(item.font) ? item.font : 'Golos Text'}"`));
  await Promise.all([...faces].map(face => {
    if (!requests.has(face)) requests.set(face, document.fonts.load(face, 'АаӘәҒғҚқҢңӨөҰұҮүҺһІі Aa 123').then(loaded => {
      if (!loaded.length) throw new Error('Шрифт не загрузился. Проверьте соединение перед экспортом.');
    }).catch(error => { requests.delete(face); throw new Error('Шрифт не загрузился. Проверьте соединение перед экспортом.', { cause: error }); }));
    return requests.get(face);
  }));
}
