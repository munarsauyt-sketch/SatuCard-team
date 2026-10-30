'use strict';

(() => {
  const video = document.querySelector('[data-intro-video]');
  const button = document.querySelector('[data-intro-play]');
  const error = document.querySelector('[data-intro-error]');
  if (!video || !button) return;

  button.hidden = false;
  button.addEventListener('click', async () => {
    button.hidden = true;
    if (video.ended) video.currentTime = 0;
    try {
      await video.play();
    } catch (_) {
      button.hidden = false;
      error.hidden = false;
    }
  });
  video.addEventListener('play', () => { button.hidden = true; error.hidden = true; });
  video.addEventListener('ended', () => {
    button.setAttribute('aria-label', 'Посмотреть интро SatuCard ещё раз');
    button.hidden = false;
  });
  video.addEventListener('error', () => { button.hidden = true; error.hidden = false; });
})();
