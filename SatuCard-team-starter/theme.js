'use strict';

(() => {
  const key = 'satucard-theme';
  const themeFromLink = new URLSearchParams(location.search).get('theme');
  let theme = themeFromLink === 'dark' || themeFromLink === 'light'
    ? themeFromLink
    : 'light';

  if (themeFromLink !== 'dark' && themeFromLink !== 'light') {
    try {
      theme = localStorage.getItem(key) === 'dark' ? 'dark' : 'light';
    } catch (_) {
      // При открытии через file:// хранилище может быть недоступно.
    }
  }

  document.documentElement.dataset.theme = theme;

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector('[data-theme-toggle]');
    if (!button) return;

    const updateLinks = () => {
      const pageDirectory = new URL('.', location.href).href;

      document.querySelectorAll('a[href]').forEach((link) => {
        try {
          const target = new URL(link.href);
          const targetDirectory = new URL('.', target.href).href;
          const fileName = target.pathname.split('/').pop();

          if (targetDirectory !== pageDirectory ||
              !['index.html', 'editor.html', 'examples.html'].includes(fileName)) {
            return;
          }

          target.searchParams.set('theme', theme);
          link.href = target.href;
        } catch (_) {
          // Внешние ссылки и специальные адреса не меняем.
        }
      });
    };

    const updateButton = () => {
      button.setAttribute('aria-pressed', String(theme === 'dark'));
    };

    button.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = theme;

      try {
        localStorage.setItem(key, theme);
      } catch (_) {
        // Переходы по ссылкам сохранят выбор и без хранилища.
      }

      const currentUrl = new URL(location.href);
      currentUrl.searchParams.set('theme', theme);
      try {
        history.replaceState(history.state, '', currentUrl.href);
      } catch (_) {
        // Некоторые браузеры ограничивают изменение адреса file://.
      }

      updateButton();
      updateLinks();
    });

    updateButton();
    updateLinks();
  });
})();
