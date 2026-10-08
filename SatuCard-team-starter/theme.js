'use strict';

(() => {
  const key = 'satucard-theme';
  let saved = 'light';

  try {
    saved = localStorage.getItem(key) === 'dark' ? 'dark' : 'light';
  } catch (_) {
    // Хранилище может быть недоступно при открытии локального файла.
  }

  document.documentElement.dataset.theme = saved;

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector('[data-theme-toggle]');
    if (!button) return;

    const updateButton = () => {
      button.setAttribute(
        'aria-pressed',
        String(document.documentElement.dataset.theme === 'dark')
      );
    };

    button.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark'
        ? 'light'
        : 'dark';

      document.documentElement.dataset.theme = next;

      try {
        localStorage.setItem(key, next);
      } catch (_) {
        // На текущей странице переключение всё равно работает.
      }

      updateButton();
    });

    updateButton();
  });
})();
