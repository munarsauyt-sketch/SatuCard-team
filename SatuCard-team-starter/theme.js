'use strict';

(() => {
  const key = 'satucard-theme';
  const defaultTheme = document.documentElement.dataset.defaultTheme === 'dark' ? 'dark' : 'light';
  const themeFromLink = new URLSearchParams(location.search).get('theme');
  let theme = themeFromLink === 'dark' || themeFromLink === 'light'
    ? themeFromLink
    : defaultTheme;

  if (themeFromLink !== 'dark' && themeFromLink !== 'light') {
    try {
      const saved = localStorage.getItem(key);
      theme = saved === 'dark' || saved === 'light' ? saved : defaultTheme;
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
        // In-page navigation must not reload the editor and discard unsaved input.
        if (link.getAttribute('href')?.startsWith('#')) return;
        try {
          const target = new URL(link.href);
          const targetDirectory = new URL('.', target.href).href;
          const fileName = target.pathname.split('/').pop();

          if (targetDirectory !== pageDirectory ||
              !['', 'index.html', 'editor.html', 'examples.html', 'card.html', 'auth.html', 'dashboard.html', 'guide.html', 'pricing.html', 'profile.html', 'video.html', 'video-guide.html'].includes(fileName)) {
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

  const TELEMETRY_PATHS = new Set([
    '/index.html', '/editor.html', '/video.html', '/examples.html',
    '/pricing.html', '/guide.html', '/video-guide.html', '/dashboard.html',
    '/auth.html', '/card.html', '/profile.html'
  ]);

  function ensureTelemetryId(storage, storageKey, prefix) {
    try {
      let existing = storage.getItem(storageKey);
      if (existing && /^[a-zA-Z0-9_-]{8,80}$/.test(existing)) return existing;
      const generated = (globalThis.crypto?.randomUUID?.() || (prefix + '-' + Math.random().toString(36).slice(2) + Date.now().toString(36))).replace(/[^a-zA-Z0-9_-]/g, '');
      const value = generated.slice(0, 64);
      storage.setItem(storageKey, value);
      return value;
    } catch (_) {
      return prefix + '-anon-' + Math.random().toString(36).slice(2, 12);
    }
  }

  function detectDevice() {
    const width = window.innerWidth || document.documentElement?.clientWidth || 1280;
    if (width < 768) return 'mobile';
    if (width <= 1024) return 'tablet';
    return 'desktop';
  }

  function normalizePagePath() {
    const raw = (location.pathname || '/').split('?')[0].split('#')[0];
    if (raw === '/' || raw === '') return '/index.html';
    const file = '/' + raw.split('/').pop();
    return TELEMETRY_PATHS.has(file) ? file : '/index.html';
  }

  function sendHeartbeat(isPageview = false) {
    if (typeof fetch !== 'function' || location.protocol === 'file:') return Promise.resolve();
    const sessionId = ensureTelemetryId(globalThis.sessionStorage, 'satucard-session-id', 'ses');
    const visitorId = ensureTelemetryId(globalThis.localStorage, 'satucard-visitor-id', 'vis');
    return fetch('api/telemetry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        visitorId,
        path: normalizePagePath(),
        device: detectDevice(),
        isPageview: Boolean(isPageview)
      }),
      keepalive: true
    }).catch(() => {});
  }

  globalThis.SATUCARD_TELEMETRY = { sendHeartbeat, detectDevice, normalizePagePath };

  if (!/jsdom/i.test(navigator.userAgent || '') && location.protocol !== 'file:') {
    sendHeartbeat(true);
    setInterval(() => {
      if (document.visibilityState === 'visible') sendHeartbeat(false);
    }, 45000);
  }
})();
