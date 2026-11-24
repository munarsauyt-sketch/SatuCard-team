'use strict';

// SatuCard Fast Toolbar v2 — Site-Wide Viewport-Floating Pro Studio Dock.
// Unlocked server-truthfully via GET /api/billing on paid plans ("ИИ Старт" 1 500 ₸+) and Admin.
// Mounted directly on document.body (position: fixed) with 4-edge magnetic docking, snap ghost,
// collapse pill, and adaptive toolsets for Editor, Video Studio, and Site Navigation.
// 0% idle GPU/CPU (self-sleeping RAF springs, pauses on document.hidden, strict CSP safe).
(() => {
  const $ = id => document.getElementById(id);
  // Defense-in-depth: Fast Toolbar belongs strictly in the Card Editor (editor.html)
  // and must never mount or float on the homepage or any other page.
  if (!$('product-canvas') || !$('editor-form')) return;

  const toggleBtn = $('fast-toolbar-toggle');
  const upsellBox = $('fast-toolbar-upsell');
  const mode = 'editor';

  const EDGE_GAP = 14;
  const TIP_DELAY = 380;
  const TIP_WARM = 300;
  const TIP_OFFSET = 10;
  const LONG_PRESS = 350;
  const DECELERATION = 0.998;
  const PROJECTION = DECELERATION / (1 - DECELERATION);
  const VELOCITY_WINDOW = 100;
  const NEXT_EDGE = { bottom: 'left', left: 'top', top: 'right', right: 'bottom' };
  const STORAGE_EDGE = 'satucard-fast-toolbar-edge';
  const STORAGE_ENABLED = 'satucard-fast-toolbar-enabled';
  const STORAGE_COLLAPSED = 'satucard-fast-toolbar-collapsed';
  const TEXT_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);
  const QUICK_STYLES = ['studio', 'noir', 'bold', 'neon', 'editorial', 'pop', 'minimal', 'blueprint'];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isReduced = () => reduceMotion.matches;
  const isKk = () => document.documentElement.lang === 'kk';
  const isVertical = edge => edge === 'left' || edge === 'right';
  const clamp = (v, min, max) => (min > max ? (min + max) / 2 : Math.min(max, Math.max(min, v)));

  // ---- Self-sleeping spring engine (0% idle CPU/GPU) ----
  const tickers = new Set();
  let rafId = 0;
  let lastT = 0;

  function makeSpring(val = 0, k = 380, d = 32, m = 1, eps = 0.08) {
    return { x: val, v: 0, target: val, k, d, m, eps };
  }

  function stepSpring(s, dt) {
    if (isReduced() || !Number.isFinite(s.x) || !Number.isFinite(s.v)) {
      s.x = s.target;
      s.v = 0;
      return false;
    }
    const steps = 4;
    const h = Math.min(0.032, dt) / steps;
    for (let i = 0; i < steps; i++) {
      const a = (-s.k * (s.x - s.target) - s.d * s.v) / s.m;
      s.v += a * h;
      s.x += s.v * h;
    }
    if (Math.abs(s.x - s.target) < s.eps && Math.abs(s.v) < s.eps * 8) {
      s.x = s.target;
      s.v = 0;
      return false;
    }
    return true;
  }

  function scheduleTick() {
    if (rafId || tickers.size === 0 || document.hidden) return;
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function loop(now) {
    rafId = 0;
    if (document.hidden) return;
    const dt = Math.max(0.004, Math.min(0.05, (now - lastT) / 1000));
    lastT = now;
    for (const fn of [...tickers]) {
      if (!fn(dt, now)) tickers.delete(fn);
    }
    if (tickers.size > 0) rafId = requestAnimationFrame(loop);
  }

  function wake(fn) {
    tickers.add(fn);
    scheduleTick();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    } else {
      scheduleTick();
    }
  });

  // ---- Viewport Geometry Helpers ----
  function getTopInset() {
    const header = document.querySelector('header.site-header, header.topbar');
    if (!header) return EDGE_GAP;
    const r = header.getBoundingClientRect();
    if (r.height > 0 && r.bottom > 0 && r.bottom < 140) {
      return clamp(Math.round(r.bottom + 10), EDGE_GAP, 118);
    }
    return EDGE_GAP;
  }

  function edgeTarget(targetEdge, W, H, w, h, topInset) {
    if (targetEdge === 'top') return { x: W / 2, y: topInset + h / 2 };
    if (targetEdge === 'left') {
      return {
        x: EDGE_GAP + w / 2,
        y: clamp((H + topInset) / 2, topInset + h / 2, H - EDGE_GAP - h / 2)
      };
    }
    if (targetEdge === 'right') {
      return {
        x: W - EDGE_GAP - w / 2,
        y: clamp((H + topInset) / 2, topInset + h / 2, H - EDGE_GAP - h / 2)
      };
    }
    return { x: W / 2, y: H - EDGE_GAP - h / 2 };
  }

  function nearestEdge(x, y, W, H, topInset) {
    const candidates = [
      ['bottom', H - y],
      ['top', y - topInset],
      ['left', x],
      ['right', W - x]
    ];
    let best = candidates[0];
    for (const c of candidates) {
      if (c[1] < best[1]) best = c;
    }
    return best[0];
  }

  function reflowStart(targetEdge, x, y, from, to, W, H, topInset) {
    let nx = x;
    let ny = y;
    if (targetEdge === 'left') nx = x - from.w / 2 + to.w / 2;
    else if (targetEdge === 'right') nx = x + from.w / 2 - to.w / 2;
    else if (targetEdge === 'top') ny = y - from.h / 2 + to.h / 2;
    else ny = y + from.h / 2 - to.h / 2;
    return {
      x: clamp(nx, to.w / 2 + 6, W - to.w / 2 - 6),
      y: clamp(ny, topInset + to.h / 2, H - to.h / 2 - 6)
    };
  }

  function releaseVelocity(samples, now) {
    const recent = samples.filter(s => now - s.t <= VELOCITY_WINDOW);
    const first = recent[0];
    const last = recent[recent.length - 1];
    if (!first || !last || recent.length < 2) return { x: 0, y: 0, cx: 0, cy: 0 };
    const dt = Math.max(1, last.t - first.t);
    return {
      x: (last.x - first.x) / dt,
      y: (last.y - first.y) / dt,
      cx: (last.cx - first.cx) / dt,
      cy: (last.cy - first.cy) / dt
    };
  }

  function isEditable(target) {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      TEXT_ROLES.has(target.getAttribute('role') || '')
    );
  }

  function isTyping(ev) {
    const path0 = typeof ev.composedPath === 'function' ? ev.composedPath()[0] : ev.target;
    return ev.isComposing || isEditable(path0) || isEditable(document.activeElement);
  }

  // ---- Native Control Helpers (zero state duplication!) ----
  function setNativeInput(id, value, fireChange = true) {
    const el = $(id);
    if (!el) return;
    if (el.type === 'checkbox') {
      el.checked = Boolean(value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (fireChange) el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function clickNative(id) {
    const el = $(id);
    if (el && !el.disabled) el.click();
  }

  // ---- Localized Labels (RU / KK) ----
  const LABELS = {
    drag: ['Перетяните к любому краю экрана', 'Экранның кез келген шетіне сүйреңіз'],
    crop: ['Кадр и просмотр', 'Кадр және қарау'],
    colors: ['Палитра и цвета', 'Палитра және түстер'],
    text: ['Текст, цена и бейджи', 'Мәтін, баға және белгілер'],
    photo: ['Фото и свет', 'Фото және жарық'],
    style: ['Стиль, фон и формат', 'Стиль, фон және пішім'],
    sai: ['Чат с sAI', 'sAI чаты'],
    undo: ['Отменить', 'Болдырмау'],
    redo: ['Повторить', 'Қайталау'],
    focus: ['Фокус на холсте', 'Кенепке фокус'],
    export: ['Экспорт карточки', 'Карточканы экспорттау'],
    collapse: ['Свернуть тулбар', 'Тулбарды жию'],
    expand: ['Развернуть тулбар', 'Тулбарды ашу'],
    // Video mode
    play: ['Старт / Пауза', 'Ойнату / Кідірту'],
    prev: ['Кадр назад', 'Алдыңғы кадр'],
    next: ['Кадр вперёд', 'Келесі кадр'],
    vformat: ['Формат и FPS', 'Пішім және FPS'],
    vedit: ['Монтаж слоёв', 'Қабаттарды монтаждау'],
    vundo: ['Отменить', 'Болдырмау'],
    vredo: ['Повторить', 'Қайталау'],
    vexport: ['Экспорт видео', 'Видеоны экспорттау'],
    nav: ['Навигация по сайту', 'Сайт бойынша өту'],
    // Site mode
    home: ['Главная', 'Басты бет'],
    editor: ['Редактор карточек', 'Карточка редакторы'],
    video: ['Видеостудия', 'Видеостудия'],
    templates: ['Шаблоны', 'Үлгілер'],
    pricing: ['Тарифы', 'Тарифтер'],
    dashboard: ['Кабинет', 'Кабинет'],
    theme: ['Сменить тему', 'Тақырыпты ауыстыру'],
    lang: ['Язык RU / KZ', 'Тіл RU / KZ']
  };
  const t = key => (isKk() ? LABELS[key]?.[1] : LABELS[key]?.[0]) || key;

  // ---- Crisp Lucide-style SVG Icons ----
  const ICONS = {
    gripV: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="6" cy="4" r="1.15" fill="currentColor" stroke="none"/><circle cx="10" cy="4" r="1.15" fill="currentColor" stroke="none"/><circle cx="6" cy="8" r="1.15" fill="currentColor" stroke="none"/><circle cx="10" cy="8" r="1.15" fill="currentColor" stroke="none"/><circle cx="6" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="10" cy="12" r="1.15" fill="currentColor" stroke="none"/></svg>',
    gripH: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="4" cy="6" r="1.15" fill="currentColor" stroke="none"/><circle cx="8" cy="6" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="6" r="1.15" fill="currentColor" stroke="none"/><circle cx="4" cy="10" r="1.15" fill="currentColor" stroke="none"/><circle cx="8" cy="10" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="10" r="1.15" fill="currentColor" stroke="none"/></svg>',
    crop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>',
    colors: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13.5" cy="6.5" r="1" fill="currentColor"/><circle cx="17.5" cy="10.5" r="1" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1" fill="currentColor"/><circle cx="6.5" cy="12.5" r="1" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.75 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9z"/></svg>',
    text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>',
    photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
    style: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    sai: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9Z"/><path d="M19 3v3"/><path d="M20.5 4.5h-3"/><path d="M5 17v2.5"/><path d="M6.25 18.25h-2.5"/></svg>',
    undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 4 9l5 5"/><path d="M4 9h9a7 7 0 0 1 0 14"/></svg>',
    redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5-5 5"/><path d="M20 9h-9a7 7 0 0 0 0 14"/></svg>',
    focus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    export: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>',
    vformat: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v14"/><path d="M16 5v14"/></svg>',
    vedit: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
    nav: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/></svg>',
    editor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    video: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3Z"/></svg>',
    templates: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    pricing: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12"/><path d="M6 8h12"/><path d="M12 8v12"/></svg>',
    dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    themeDark: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
    themeLight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
    caret: '<svg class="ft-corner-caret" viewBox="0 0 5 5" aria-hidden="true"><path d="M5 0V5H0Z" fill="currentColor" stroke="none"/></svg>'
  };

  // ---- Adaptive Tool Definitions per Page Mode ----
  const TOOLS_BY_MODE = {
    editor: [
      { id: 'crop', key: 'V', icon: ICONS.crop, hasFlyout: true },
      { id: 'colors', key: 'P', icon: ICONS.colors, hasFlyout: true },
      { id: 'text', key: 'T', icon: ICONS.text, hasFlyout: true },
      { id: 'photo', key: 'I', icon: ICONS.photo, hasFlyout: true },
      { id: 'style', key: 'F', icon: ICONS.style, hasFlyout: true },
      { id: 'divider' },
      { id: 'sai', key: 'A', icon: ICONS.sai, accent: true },
      { id: 'undo', key: 'Ctrl+Z', icon: ICONS.undo },
      { id: 'redo', key: 'Ctrl+Y', icon: ICONS.redo },
      { id: 'focus', key: 'H', icon: ICONS.focus },
      { id: 'export', key: 'E', icon: ICONS.export, hasFlyout: true, accent: true },
      { id: 'divider' },
      { id: 'collapse', key: '', icon: ICONS.collapse }
    ],
    video: [
      { id: 'play', key: 'Space', icon: ICONS.play, accent: true },
      { id: 'prev', key: '←', icon: ICONS.prev },
      { id: 'next', key: '→', icon: ICONS.next },
      { id: 'vformat', key: 'F', icon: ICONS.vformat, hasFlyout: true },
      { id: 'vedit', key: 'M', icon: ICONS.vedit, hasFlyout: true },
      { id: 'divider' },
      { id: 'vundo', key: 'Ctrl+Z', icon: ICONS.undo },
      { id: 'vredo', key: 'Ctrl+Y', icon: ICONS.redo },
      { id: 'vexport', key: 'E', icon: ICONS.export, accent: true },
      { id: 'nav', key: 'G', icon: ICONS.nav, hasFlyout: true },
      { id: 'divider' },
      { id: 'collapse', key: '', icon: ICONS.collapse }
    ],
    site: [
      { id: 'home', href: 'index.html', icon: ICONS.home },
      { id: 'editor', href: 'editor.html', icon: ICONS.editor, accent: true },
      { id: 'video', href: 'video.html', icon: ICONS.video },
      { id: 'templates', href: 'examples.html', icon: ICONS.templates },
      { id: 'pricing', href: 'pricing.html', icon: ICONS.pricing },
      { id: 'dashboard', href: 'dashboard.html', icon: ICONS.dashboard },
      { id: 'divider' },
      { id: 'theme', icon: ICONS.themeDark },
      { id: 'lang', isLang: true },
      { id: 'divider' },
      { id: 'collapse', icon: ICONS.collapse }
    ]
  };

  const TOOLS = TOOLS_BY_MODE[mode];

  function detectSiteActiveTool() {
    const p = (location.pathname || '').toLowerCase();
    if (p.endsWith('/examples.html') || p.endsWith('examples.html')) return 'templates';
    if (p.endsWith('/pricing.html') || p.endsWith('pricing.html')) return 'pricing';
    if (p.endsWith('/dashboard.html') || p.endsWith('dashboard.html')) return 'dashboard';
    if (p.endsWith('/video.html') || p.endsWith('video.html')) return 'video';
    if (p.endsWith('/editor.html') || p.endsWith('editor.html')) return 'editor';
    return 'home';
  }

  // ---- Build Viewport-Fixed Dock DOM directly on document.body ----
  const snapGhost = document.createElement('div');
  snapGhost.className = 'ft-snap-ghost';
  snapGhost.setAttribute('aria-hidden', 'true');

  const wrap = document.createElement('div');
  wrap.className = 'ft-dock-wrap';
  wrap.id = 'fast-toolbar-dock';
  wrap.dataset.edge = 'bottom';
  wrap.dataset.mode = mode;
  wrap.hidden = true;

  const dock = document.createElement('div');
  dock.className = 'ft-dock';
  dock.setAttribute('role', 'toolbar');
  dock.setAttribute('aria-label', 'Быстрый тулбар SatuCard');
  dock.setAttribute('aria-orientation', 'horizontal');

  const plate = document.createElement('span');
  plate.className = 'ft-plate';
  plate.setAttribute('aria-hidden', 'true');

  const grip = document.createElement('button');
  grip.type = 'button';
  grip.className = 'ft-grip';
  grip.setAttribute('data-ft-item', 'grip');
  grip.setAttribute('aria-label', t('drag'));
  grip.innerHTML = ICONS.gripV;

  const div1 = document.createElement('span');
  div1.className = 'ft-divider';
  div1.setAttribute('aria-hidden', 'true');

  const slotButtons = new Map();
  dock.append(plate, grip, div1);

  TOOLS.forEach(item => {
    if (item.id === 'divider') {
      const d = document.createElement('span');
      d.className = 'ft-divider';
      d.setAttribute('aria-hidden', 'true');
      dock.append(d);
      return;
    }
    const slot = document.createElement('div');
    slot.className = 'ft-slot';
    slot.dataset.ftSlot = item.id;

    const useAnchor = Boolean(item.href && !(item.id === 'templates' && $('template-cmd-trigger')));
    const btn = document.createElement(useAnchor ? 'a' : 'button');
    if (useAnchor) {
      btn.href = item.href;
    } else {
      btn.type = 'button';
    }
    btn.className = 'ft-btn' + (item.accent ? ' ft-btn-accent' : '');
    btn.dataset.ftTool = item.id;
    btn.setAttribute('data-ft-item', item.id);
    btn.setAttribute('aria-label', t(item.id));
    if (item.key && item.key.length === 1) btn.setAttribute('aria-keyshortcuts', item.key);
    if (!useAnchor) btn.setAttribute('aria-pressed', 'false');
    btn.tabIndex = -1;

    if (item.isLang) {
      const badge = document.createElement('span');
      badge.className = 'ft-lang-badge';
      badge.textContent = isKk() ? 'KZ' : 'RU';
      btn.append(badge);
    } else {
      btn.innerHTML = (item.icon || '') + (item.hasFlyout ? ICONS.caret : '');
    }

    slot.append(btn);
    dock.append(slot);
    slotButtons.set(item.id, btn);
  });

  const tipEl = document.createElement('div');
  tipEl.className = 'ft-tip';
  tipEl.setAttribute('aria-hidden', 'true');

  const flyoutEl = document.createElement('div');
  flyoutEl.className = 'ft-flyout';
  flyoutEl.id = 'fast-toolbar-flyout';
  flyoutEl.setAttribute('role', 'dialog');
  flyoutEl.hidden = true;

  wrap.append(dock);
  document.body.append(snapGhost, wrap, tipEl, flyoutEl);

  // ---- Persistent & Runtime State ----
  let unlocked = false;
  let planName = '';
  let enabledByUser = true;
  try {
    if (localStorage.getItem(STORAGE_ENABLED) === '0') enabledByUser = false;
  } catch (_) {}

  let edge = 'bottom';
  try {
    const savedEdge = localStorage.getItem(STORAGE_EDGE);
    if (savedEdge && ['bottom', 'top', 'left', 'right'].includes(savedEdge)) edge = savedEdge;
  } catch (_) {}

  let collapsed = false;
  try {
    if (localStorage.getItem(STORAGE_COLLAPSED) === '1') collapsed = true;
  } catch (_) {}

  let activeTool = mode === 'editor' ? 'crop' : mode === 'video' ? 'play' : detectSiteActiveTool();
  let paletteTone = 'all';
  let openFlyoutId = null;
  let dragging = false;
  let dragState = null;
  let bounds = { W: window.innerWidth, H: window.innerHeight, w: 0, h: 0, topInset: EDGE_GAP };

  const sX = makeSpring(0, 380, 32, 1, 0.12);
  const sY = makeSpring(0, 380, 32, 1, 0.12);
  const sPlateX = makeSpring(0, 460, 34, 1, 0.08);
  const sPlateY = makeSpring(0, 460, 34, 1, 0.08);
  let plateReady = false;

  // ---- Viewport Tooltip Group (380ms cold delay, 300ms warm window) ----
  let tipTimer = 0;
  let tipOpen = false;
  let tipWarmUntil = 0;

  function hideTip() {
    clearTimeout(tipTimer);
    if (tipOpen) tipWarmUntil = performance.now() + TIP_WARM;
    tipOpen = false;
    tipEl.classList.remove('is-visible');
  }

  function positionTip(btn) {
    const bRect = btn.getBoundingClientRect();
    const dRect = dock.getBoundingClientRect();
    const tW = tipEl.offsetWidth || 110;
    const tH = tipEl.offsetHeight || 28;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const bMidX = bRect.left + bRect.width / 2;
    const bMidY = bRect.top + bRect.height / 2;

    let x = bMidX - tW / 2;
    let y = dRect.top - tH - TIP_OFFSET;

    if (edge === 'top') {
      y = dRect.bottom + TIP_OFFSET;
    } else if (edge === 'left') {
      x = dRect.right + TIP_OFFSET;
      y = bMidY - tH / 2;
    } else if (edge === 'right') {
      x = dRect.left - tW - TIP_OFFSET;
      y = bMidY - tH / 2;
    }

    x = clamp(x, 10, Math.max(10, W - tW - 10));
    y = clamp(y, 10, Math.max(10, H - tH - 10));
    tipEl.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  }

  function showTip(btn, label, shortcut) {
    if (dragging || openFlyoutId || window.matchMedia('(hover: none)').matches) return;
    clearTimeout(tipTimer);
    const reveal = () => {
      if (dragging || openFlyoutId) return;
      tipEl.textContent = '';
      const span = document.createElement('span');
      span.textContent = label;
      tipEl.append(span);
      if (shortcut) {
        const kbd = document.createElement('kbd');
        kbd.textContent = shortcut;
        tipEl.append(kbd);
      }
      positionTip(btn);
      tipOpen = true;
      tipEl.classList.add('is-visible');
    };
    if (tipOpen || performance.now() < tipWarmUntil) reveal();
    else tipTimer = setTimeout(reveal, TIP_DELAY);
  }

  // ---- Snap Preview Ghost (visual landing target while dragging) ----
  function updateSnapGhost(rawX, rawY) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const topInset = getTopInset();
    let previewEdge = nearestEdge(rawX, rawY, W, H, topInset);
    if (W < 720 && isVertical(previewEdge)) previewEdge = 'bottom';

    const curW = dock.offsetWidth || 320;
    const curH = dock.offsetHeight || 50;
    const currentlyVert = wrap.classList.contains('is-vertical');
    const previewVert = isVertical(previewEdge) && W >= 720;
    const pw = currentlyVert === previewVert ? curW : curH;
    const ph = currentlyVert === previewVert ? curH : curW;
    const tgt = edgeTarget(previewEdge, W, H, pw, ph, topInset);

    snapGhost.style.width = `${Math.round(pw)}px`;
    snapGhost.style.height = `${Math.round(ph)}px`;
    snapGhost.style.borderRadius = collapsed ? '999px' : '18px';
    snapGhost.style.transform = `translate3d(${Math.round(tgt.x - pw / 2)}px, ${Math.round(tgt.y - ph / 2)}px, 0)`;
    snapGhost.classList.add('is-visible');
  }

  function hideSnapGhost() {
    snapGhost.classList.remove('is-visible');
  }

  // ---- Dock & Plate Spring Motion ----
  function paintDock() {
    const cx = clamp(sX.x, bounds.w / 2 + 6, bounds.W - bounds.w / 2 - 6);
    const cy = clamp(sY.x, bounds.topInset + bounds.h / 2, bounds.H - bounds.h / 2 - 6);
    wrap.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) translate(-50%, -50%)`;
  }

  const tickDock = dt => {
    const a = stepSpring(sX, dt);
    const b = stepSpring(sY, dt);
    paintDock();
    if (openFlyoutId) positionFlyout();
    return a || b;
  };

  const tickPlate = dt => {
    const a = stepSpring(sPlateX, dt);
    const b = stepSpring(sPlateY, dt);
    plate.style.transform = `translate3d(${sPlateX.x.toFixed(2)}px, ${sPlateY.x.toFixed(2)}px, 0)`;
    return a || b;
  };

  function syncPlate(instant = false) {
    if (collapsed || wrap.hidden) {
      plate.style.opacity = '0';
      return;
    }
    const btn = slotButtons.get(activeTool);
    if (!btn) {
      plate.style.opacity = '0';
      return;
    }
    const dRect = dock.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    if (!bRect.width) return;
    const tx = bRect.left - dRect.left - dock.clientLeft + dock.scrollLeft;
    const ty = bRect.top - dRect.top - dock.clientTop + dock.scrollTop;
    sPlateX.target = tx;
    sPlateY.target = ty;
    plate.style.width = `${bRect.width}px`;
    plate.style.height = `${bRect.height}px`;
    if (!plateReady || instant || isReduced()) {
      sPlateX.x = tx; sPlateX.v = 0;
      sPlateY.x = ty; sPlateY.v = 0;
      plate.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
      plate.style.opacity = '1';
      plateReady = true;
    } else {
      plate.style.opacity = '1';
      wake(tickPlate);
    }
  }

  function applyEdgeClass(nextEdge) {
    const vert = isVertical(nextEdge) && window.innerWidth >= 720;
    wrap.dataset.edge = nextEdge;
    wrap.classList.toggle('is-vertical', vert);
    wrap.classList.toggle('is-collapsed', collapsed);
    dock.setAttribute('aria-orientation', vert ? 'vertical' : 'horizontal');
    grip.innerHTML = vert ? ICONS.gripH : ICONS.gripV;
  }

  function publishDockLayout() {
    const rootStyle = document.documentElement.style;
    if (wrap.hidden) {
      rootStyle.setProperty('--ft-avoid-top', '0px');
      rootStyle.setProperty('--ft-avoid-bottom', '0px');
      rootStyle.setProperty('--ft-avoid-left', '0px');
      rootStyle.setProperty('--ft-avoid-right', '0px');
      document.dispatchEvent(new CustomEvent('satucard:dock-layout', {
        detail: { visible: false, edge, collapsed, width: 0, height: 0, topInset: getTopInset() }
      }));
      return;
    }
    const w = dock.offsetWidth || 0;
    const h = dock.offsetHeight || 0;
    const topInset = getTopInset();
    rootStyle.setProperty('--ft-avoid-top', edge === 'top' ? `${Math.round(topInset + h + 12)}px` : '0px');
    rootStyle.setProperty('--ft-avoid-bottom', edge === 'bottom' ? `${Math.round(h + EDGE_GAP + 12)}px` : '0px');
    rootStyle.setProperty('--ft-avoid-left', edge === 'left' ? `${Math.round(w + EDGE_GAP + 12)}px` : '0px');
    rootStyle.setProperty('--ft-avoid-right', edge === 'right' ? `${Math.round(w + EDGE_GAP + 12)}px` : '0px');
    document.dispatchEvent(new CustomEvent('satucard:dock-layout', {
      detail: { visible: true, edge, collapsed, width: w, height: h, topInset }
    }));
  }

  function settleDock(velocity = null) {
    if (wrap.hidden) return;
    applyEdgeClass(edge);
    const W = window.innerWidth;
    const H = window.innerHeight;
    const topInset = getTopInset();
    const w = dock.offsetWidth || 320;
    const h = dock.offsetHeight || 50;
    bounds = { W, H, w, h, topInset };
    const target = edgeTarget(edge, W, H, w, h, topInset);
    sX.target = target.x;
    sY.target = target.y;
    if (!velocity || isReduced()) {
      sX.x = target.x; sX.v = 0;
      sY.x = target.y; sY.v = 0;
      paintDock();
    } else {
      sX.v = velocity.x;
      sY.v = velocity.y;
      wake(tickDock);
    }
    syncPlate(true);
    if (openFlyoutId) positionFlyout();
    publishDockLayout();
  }

  function dockTo(nextEdge, velocity = { x: 0, y: 0 }) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const topInset = getTopInset();
    const normalized = W < 720 && isVertical(nextEdge) ? 'bottom' : nextEdge;
    const prevSize = { w: dock.offsetWidth, h: dock.offsetHeight };
    const changed = normalized !== edge;
    edge = normalized;
    try { localStorage.setItem(STORAGE_EDGE, edge); } catch (_) {}
    if (changed) {
      applyEdgeClass(edge);
      const nextSize = { w: dock.offsetWidth, h: dock.offsetHeight };
      if (prevSize.w !== nextSize.w || prevSize.h !== nextSize.h) {
        const start = reflowStart(edge, sX.x, sY.x, prevSize, nextSize, W, H, topInset);
        sX.x = start.x;
        sY.x = start.y;
      }
    }
    settleDock(velocity);
  }

  function setCollapsed(next) {
    collapsed = Boolean(next);
    try { localStorage.setItem(STORAGE_COLLAPSED, collapsed ? '1' : '0'); } catch (_) {}
    if (collapsed) {
      closeFlyout();
      hideTip();
    }
    syncButtonStates();
    settleDock({ x: 0, y: 0 });
  }

  // ---- Dragging Across Entire Viewport via Grip ----
  grip.addEventListener('pointerdown', ev => {
    if (ev.button !== 0 || wrap.hidden) return;
    ev.preventDefault();
    grip.setPointerCapture?.(ev.pointerId);
    tickers.delete(tickDock);
    hideTip();
    closeFlyout();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const topInset = getTopInset();
    bounds = { W, H, w: dock.offsetWidth || 320, h: dock.offsetHeight || 50, topInset };
    const x = clamp(sX.x, bounds.w / 2 + 6, W - bounds.w / 2 - 6);
    const curY = clamp(sY.x, topInset + bounds.h / 2, H - bounds.h / 2 - 6);
    sX.x = x; sY.x = curY;
    dragState = {
      dx: ev.clientX - x,
      dy: ev.clientY - curY,
      samples: [{ t: ev.timeStamp, x, y: curY, cx: x, cy: curY }]
    };
    dragging = true;
    wrap.classList.add('is-dragging');
    updateSnapGhost(x, curY);
  });

  grip.addEventListener('pointermove', ev => {
    if (!dragState) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const topInset = bounds.topInset;
    const hw = (dock.offsetWidth || 320) / 2;
    const hh = (dock.offsetHeight || 50) / 2;
    const rawX = ev.clientX - dragState.dx;
    const rawY = ev.clientY - dragState.dy;
    const drawnX = clamp(rawX, hw + 6, W - hw - 6);
    const drawnY = clamp(rawY, topInset + hh, H - hh - 6);
    sX.x = drawnX;
    sY.x = drawnY;
    paintDock();
    updateSnapGhost(rawX, rawY);
    dragState.samples.push({ t: ev.timeStamp, x: rawX, y: rawY, cx: drawnX, cy: drawnY });
    if (dragState.samples.length > 8) dragState.samples.shift();
  });

  function finishGripDrag(ev) {
    if (!dragState) return;
    const d = dragState;
    dragState = null;
    dragging = false;
    wrap.classList.remove('is-dragging');
    hideSnapGhost();
    const last = d.samples[d.samples.length - 1] || { x: sX.x, y: sY.x, t: ev.timeStamp };
    const paused = ev.timeStamp - last.t > 55;
    const rawV = paused ? { x: 0, y: 0, cx: 0, cy: 0 } : releaseVelocity(d.samples, ev.timeStamp);
    const speed = Math.hypot(rawV.x, rawV.y);
    const scale = speed > 2.2 ? 2.2 / speed : 1;
    const vx = rawV.x * scale;
    const vy = rawV.y * scale;
    const cSpeed = Math.hypot(rawV.cx, rawV.cy);
    const cScale = cSpeed > 2.2 ? 2.2 / cSpeed : 1;
    const vcx = rawV.cx * cScale;
    const vcy = rawV.cy * cScale;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const topInset = getTopInset();
    const projMs = Math.min(PROJECTION, 160);
    const px = last.x + vx * projMs;
    const py = last.y + vy * projMs;
    dockTo(nearestEdge(px, py, W, H, topInset), { x: vcx * 1000, y: vcy * 1000 });
  }

  grip.addEventListener('lostpointercapture', finishGripDrag);
  grip.addEventListener('pointerup', ev => {
    if (dragState) {
      grip.releasePointerCapture?.(ev.pointerId);
      finishGripDrag(ev);
    }
  });
  grip.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      dockTo(NEXT_EDGE[edge], { x: 0, y: 0 });
    }
  });

  // ---- Viewport-Clamped Flyout Positioning & UI Builders ----
  function positionFlyout() {
    if (!openFlyoutId || flyoutEl.hidden) return;
    const dRect = dock.getBoundingClientRect();
    const btn = slotButtons.get(openFlyoutId);
    const bRect = btn ? btn.getBoundingClientRect() : dRect;
    const fW = flyoutEl.offsetWidth || 288;
    const fH = flyoutEl.offsetHeight || 220;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const topInset = getTopInset();

    let x = bRect.left + bRect.width / 2 - fW / 2;
    let y = dRect.top - fH - 12;
    let origin = '50% 100%';

    if (edge === 'top') {
      y = dRect.bottom + 12;
      origin = '50% 0%';
    } else if (edge === 'left') {
      x = dRect.right + 12;
      y = bRect.top + bRect.height / 2 - fH / 2;
      origin = '0% 50%';
    } else if (edge === 'right') {
      x = dRect.left - fW - 12;
      y = bRect.top + bRect.height / 2 - fH / 2;
      origin = '100% 50%';
    }

    x = clamp(x, 12, Math.max(12, W - fW - 12));
    y = clamp(y, topInset, Math.max(topInset, H - fH - 12));
    flyoutEl.style.left = `${Math.round(x)}px`;
    flyoutEl.style.top = `${Math.round(y)}px`;
    flyoutEl.style.transformOrigin = origin;
  }

  function closeFlyout() {
    if (!openFlyoutId) return;
    openFlyoutId = null;
    flyoutEl.classList.remove('is-open');
    flyoutEl.hidden = true;
    syncButtonStates();
  }

  function makeSectionLabel(text) {
    const el = document.createElement('div');
    el.className = 'ft-section-label';
    el.textContent = text;
    return el;
  }

  function makePill(label, pressed, onClick, opts = {}) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ft-pill' + (opts.primary ? ' ft-pill-primary' : '');
    if (!opts.primary) b.setAttribute('aria-pressed', String(Boolean(pressed)));
    if (opts.disabled) b.disabled = true;
    if (opts.dotColor) {
      const dot = document.createElement('i');
      dot.className = 'ft-style-dot';
      dot.style.background = opts.dotColor;
      b.append(dot);
    }
    const span = document.createElement('span');
    span.textContent = label;
    b.append(span);
    b.addEventListener('click', onClick);
    return b;
  }

  function makeLinkPill(label, href) {
    const a = document.createElement('a');
    a.className = 'ft-pill';
    a.href = href;
    a.textContent = label;
    return a;
  }

  function makeLiveSlider(label, nativeId, unit = '%') {
    const native = $(nativeId);
    const wrapField = document.createElement('div');
    wrapField.className = 'ft-slider-field';
    const head = document.createElement('div');
    head.className = 'ft-slider-head';
    const lbl = document.createElement('span');
    lbl.textContent = label;
    const out = document.createElement('output');
    out.textContent = `${native ? native.value : '100'}${unit}`;
    head.append(lbl, out);
    const range = document.createElement('input');
    range.type = 'range';
    range.min = native ? native.min : '50';
    range.max = native ? native.max : '150';
    range.value = native ? native.value : '100';
    range.setAttribute('aria-label', label);
    range.addEventListener('input', () => {
      out.textContent = `${range.value}${unit}`;
      setNativeInput(nativeId, range.value, false);
    });
    range.addEventListener('change', () => {
      setNativeInput(nativeId, range.value, true);
    });
    wrapField.append(head, range);
    return wrapField;
  }

  function renderFlyoutHeader(toolId) {
    const head = document.createElement('div');
    head.className = 'ft-flyout-head';
    const left = document.createElement('div');
    left.className = 'ft-flyout-head-left';
    const title = document.createElement('span');
    title.className = 'ft-flyout-title';
    title.textContent = t(toolId);
    left.append(title);
    const key = TOOLS.find(x => x.id === toolId)?.key;
    if (key) {
      const k = document.createElement('kbd');
      k.className = 'ft-flyout-key';
      k.textContent = key;
      left.append(k);
    }
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ft-flyout-close';
    closeBtn.setAttribute('aria-label', isKk() ? 'Жабу' : 'Закрыть');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeFlyout);
    head.append(left, closeBtn);
    flyoutEl.append(head);
  }

  function renderFlyout(toolId) {
    flyoutEl.replaceChildren();
    flyoutEl.setAttribute('aria-label', t(toolId));
    renderFlyoutHeader(toolId);

    // ==================== EDITOR FLYOUTS ====================
    if (toolId === 'crop') {
      const cropActive = $('crop-photo')?.getAttribute('aria-pressed') === 'true';
      const fitChecked = document.querySelector('input[name="photo-fit"]:checked')?.value || 'contain';
      const g = document.createElement('div');
      g.className = 'ft-grid-2';
      g.append(
        makePill(isKk() ? 'Кадрлау' : 'Кадрировать', cropActive, () => { clickNative('crop-photo'); renderFlyout('crop'); }),
        makePill(isKk() ? 'Ортаға' : 'По центру', false, () => clickNative('center-photo')),
        makePill(isKk() ? 'Сыйғызу' : 'Вписать', fitChecked === 'contain', () => {
          const r = document.querySelector('input[name="photo-fit"][value="contain"]');
          if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); renderFlyout('crop'); }
        }),
        makePill(isKk() ? 'Толтыру' : 'Заполнить', fitChecked === 'cover', () => {
          const r = document.querySelector('input[name="photo-fit"][value="cover"]');
          if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); renderFlyout('crop'); }
        })
      );
      flyoutEl.append(g);

      flyoutEl.append(makeSectionLabel(isKk() ? 'Қарап шығу' : 'Предпросмотр'));
      const pv = document.createElement('div');
      pv.className = 'ft-grid-2';
      pv.append(
        makePill(isKk() ? 'Телефонда' : 'На телефоне', false, () => { closeFlyout(); clickNative('phone-preview-button'); }),
        makePill(isKk() ? 'Толық экран' : 'На весь экран', false, () => { closeFlyout(); clickNative('fullscreen-button'); })
      );
      flyoutEl.append(pv);
    }

    if (toolId === 'colors') {
      // Tone filter segmented control
      const seg = document.createElement('div');
      seg.className = 'ft-seg';
      [
        ['all', isKk() ? 'Барлығы' : 'Все'],
        ['light', isKk() ? 'Ашық' : 'Светлые'],
        ['dark', isKk() ? 'Қою' : 'Тёмные']
      ].forEach(([tone, lbl]) => {
        const sb = document.createElement('button');
        sb.type = 'button';
        sb.className = 'ft-seg-btn';
        sb.setAttribute('aria-pressed', String(paletteTone === tone));
        sb.textContent = lbl;
        sb.addEventListener('click', () => {
          paletteTone = tone;
          renderFlyout('colors');
        });
        seg.append(sb);
      });
      flyoutEl.append(seg);

      // 12 live palette swatches (reading --palette-a & --palette-b from #palette-grid)
      const allPal = [...document.querySelectorAll('#palette-grid [data-palette]')];
      let palButtons;
      if (paletteTone === 'light') {
        palButtons = allPal.filter(b => b.dataset.tone === 'light').slice(0, 12);
      } else if (paletteTone === 'dark') {
        palButtons = allPal.filter(b => b.dataset.tone === 'dark').slice(0, 12);
      } else {
        const lightPal = allPal.filter(b => b.dataset.tone === 'light').slice(0, 6);
        const darkPal = allPal.filter(b => b.dataset.tone === 'dark').slice(0, 6);
        palButtons = [...lightPal, ...darkPal];
        for (const b of allPal) {
          if (palButtons.length >= 12) break;
          if (!palButtons.includes(b)) palButtons.push(b);
        }
      }

      if (palButtons.length) {
        const grid = document.createElement('div');
        grid.className = 'ft-swatch-grid';
        palButtons.forEach(pb => {
          const sw = pb.querySelector('i');
          const bg = sw?.style.getPropertyValue('--palette-a')?.trim() || '#f2efe9';
          const acc = sw?.style.getPropertyValue('--palette-b')?.trim() || '#ea784e';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ft-swatch-btn';
          btn.style.background = bg;
          btn.title = pb.dataset.palette || pb.textContent?.trim() || '';
          btn.setAttribute('aria-label', btn.title);
          btn.setAttribute('aria-pressed', pb.getAttribute('aria-pressed') || 'false');
          const corner = document.createElement('span');
          corner.className = 'ft-swatch-corner';
          corner.style.background = acc;
          btn.append(corner);
          btn.addEventListener('click', () => {
            pb.click();
            requestAnimationFrame(() => renderFlyout('colors'));
          });
          grid.append(btn);
        });
        flyoutEl.append(grid);
      }

      // Live WCAG Contrast Strip
      const meter = $('contrast-meter');
      const fixBtn = $('fix-contrast');
      if (meter && meter.textContent?.trim()) {
        const low = meter.dataset.level === 'low' || meter.dataset.level === 'mid';
        const bar = document.createElement('div');
        bar.className = 'ft-contrast-bar' + (low ? ' is-low' : '');
        const txt = document.createElement('span');
        txt.textContent = meter.textContent.trim();
        bar.append(txt);
        if (low && fixBtn && !fixBtn.hidden) {
          const fixAction = document.createElement('button');
          fixAction.type = 'button';
          fixAction.className = 'ft-contrast-fix';
          fixAction.textContent = isKk() ? 'Жақсарту' : 'Улучшить';
          fixAction.addEventListener('click', () => {
            fixBtn.click();
            requestAnimationFrame(() => renderFlyout('colors'));
          });
          bar.append(fixAction);
        }
        flyoutEl.append(bar);
      }

      // Direct Background / Accent / Text color pickers
      const pickers = document.createElement('div');
      pickers.className = 'ft-color-pickers';
      [
        ['background-color', isKk() ? 'Фон' : 'Фон'],
        ['accent-color', isKk() ? 'Акцент' : 'Акцент'],
        ['text-color', isKk() ? 'Мәтін' : 'Текст']
      ].forEach(([nativeId, lbl]) => {
        const native = $(nativeId);
        const chip = document.createElement('label');
        chip.className = 'ft-color-chip';
        const inp = document.createElement('input');
        inp.type = 'color';
        inp.value = native ? native.value : '#ffffff';
        inp.setAttribute('aria-label', lbl);
        inp.addEventListener('input', () => {
          const custom = $('custom-colors');
          if (custom && !custom.checked) setNativeInput('custom-colors', true);
          setNativeInput(nativeId, inp.value, false);
        });
        inp.addEventListener('change', () => {
          setNativeInput(nativeId, inp.value, true);
          requestAnimationFrame(() => renderFlyout('colors'));
        });
        const sp = document.createElement('span');
        sp.textContent = lbl;
        chip.append(inp, sp);
        pickers.append(chip);
      });
      flyoutEl.append(pickers);

      const actions = document.createElement('div');
      actions.className = 'ft-grid-2';
      actions.append(
        makePill(isKk() ? '⇄ Ауыстыру' : '⇄ Поменять', false, () => { clickNative('swap-colors'); requestAnimationFrame(() => renderFlyout('colors')); }),
        makePill(isKk() ? '✦ Стиль таңдау' : '✦ Подобрать', false, () => { clickNative('shuffle-style'); requestAnimationFrame(() => renderFlyout('colors')); })
      );
      flyoutEl.append(actions);

      const photoPalBtn = $('photo-palette');
      if (photoPalBtn) {
        flyoutEl.append(
          makePill(
            isKk() ? 'Фотодан палитра алу' : 'Палитра из фото',
            false,
            () => { clickNative('photo-palette'); requestAnimationFrame(() => renderFlyout('colors')); },
            { disabled: photoPalBtn.disabled }
          )
        );
      }
    }

    if (toolId === 'text') {
      // Live inline Title & Price editors (never re-render on input so focus stays smooth!)
      const inputsWrap = document.createElement('div');
      inputsWrap.className = 'ft-inline-inputs';

      const nameNative = $('product-name');
      const nameField = document.createElement('label');
      nameField.className = 'ft-inline-field';
      const nameLbl = document.createElement('span');
      nameLbl.textContent = isKk() ? 'Тауар атауы' : 'Название товара';
      const nameInp = document.createElement('input');
      nameInp.type = 'text';
      nameInp.className = 'ft-input';
      nameInp.id = 'ft-inline-name';
      nameInp.maxLength = 60;
      nameInp.value = nameNative?.value || '';
      nameInp.placeholder = nameNative?.placeholder || '';
      nameInp.addEventListener('input', () => setNativeInput('product-name', nameInp.value, false));
      nameInp.addEventListener('change', () => setNativeInput('product-name', nameInp.value, true));
      nameField.append(nameLbl, nameInp);

      const priceNative = $('product-price');
      const priceField = document.createElement('label');
      priceField.className = 'ft-inline-field';
      const priceLbl = document.createElement('span');
      priceLbl.textContent = isKk() ? 'Бағасы (₸)' : 'Цена (₸)';
      const priceInp = document.createElement('input');
      priceInp.type = 'text';
      priceInp.inputMode = 'decimal';
      priceInp.className = 'ft-input';
      priceInp.id = 'ft-inline-price';
      priceInp.maxLength = 14;
      priceInp.value = priceNative?.value || '';
      priceInp.placeholder = '24 990';
      priceInp.addEventListener('input', () => setNativeInput('product-price', priceInp.value, false));
      priceInp.addEventListener('change', () => setNativeInput('product-price', priceInp.value, true));
      priceField.append(priceLbl, priceInp);

      inputsWrap.append(nameField, priceField);
      flyoutEl.append(inputsWrap);

      // Quick discount presets
      flyoutEl.append(makeSectionLabel(isKk() ? 'Жеңілдік' : 'Скидка'));
      const discRow = document.createElement('div');
      discRow.className = 'ft-row';
      [
        ['10', '−10%'],
        ['15', '−15%'],
        ['20', '−20%'],
        ['30', '−30%'],
        ['0', '×']
      ].forEach(([val, lbl]) => {
        const nativeBtn = document.querySelector(`[data-discount-preset="${val}"]`);
        discRow.append(makePill(lbl, false, () => {
          nativeBtn?.click();
          if ($('product-price')) priceInp.value = $('product-price').value;
        }));
      });
      flyoutEl.append(discRow);

      // Quick KZ / Kaspi marketplace badges
      flyoutEl.append(makeSectionLabel(isKk() ? 'Жылдам белгілер' : 'Бейджи Kaspi / KZ'));
      const badgeRow = document.createElement('div');
      badgeRow.className = 'ft-row';
      const curBadge = ($('product-badge')?.value || '').trim();
      [
        ['Хит Kaspi', 'Хит Kaspi'],
        ['0-0-12', '0-0-12'],
        ['0-0-24', '0-0-24'],
        ['Доставка 1 день', isKk() ? '1 күнде' : '1 день'],
        ['Бөліп төлеу 0-0-12', 'Бөліп төлеу'],
        ['', '×']
      ].forEach(([val, lbl]) => {
        const nativeBtn = document.querySelector(`[data-badge-preset="${val}"]`);
        badgeRow.append(makePill(lbl, Boolean(val && curBadge === val), () => {
          if (nativeBtn) nativeBtn.click();
          else setNativeInput('product-badge', val);
          renderFlyout('text');
        }));
      });
      flyoutEl.append(badgeRow);

      // Typography sliders & controls
      flyoutEl.append(makeLiveSlider(isKk() ? 'Мәтін өлшемі' : 'Размер текста', 'text-scale', '%'));

      const alignVal = $('text-align')?.value || 'left';
      const caseVal = $('design-title-case')?.value || 'template';
      const weightVal = $('design-title-weight')?.value || 'template';
      const row1 = document.createElement('div');
      row1.className = 'ft-grid-2';
      row1.append(
        makePill(isKk() ? 'Сол жақ' : 'Слева', alignVal === 'left', () => { setNativeInput('text-align', 'left'); renderFlyout('text'); }),
        makePill(isKk() ? 'Ортаға' : 'По центру', alignVal === 'center', () => { setNativeInput('text-align', 'center'); renderFlyout('text'); })
      );
      flyoutEl.append(row1);

      const row2 = document.createElement('div');
      row2.className = 'ft-grid-4';
      row2.append(
        makePill('Aa', caseVal !== 'upper', () => { setNativeInput('design-title-case', 'original'); renderFlyout('text'); }),
        makePill('AA', caseVal === 'upper', () => { setNativeInput('design-title-case', 'upper'); renderFlyout('text'); }),
        makePill('B', weightVal === 'bold', () => { setNativeInput('design-title-weight', 'bold'); renderFlyout('text'); }),
        makePill('B+', weightVal === 'heavy', () => { setNativeInput('design-title-weight', 'heavy'); renderFlyout('text'); })
      );
      flyoutEl.append(row2);

      // Price badge style
      const priceStyle = $('design-price')?.value || 'template';
      const pRow = document.createElement('div');
      pRow.className = 'ft-grid-4';
      [
        ['plain', isKk() ? 'Мәтін' : 'Текст'],
        ['filled', isKk() ? 'Толық' : 'Плашка'],
        ['outline', isKk() ? 'Жиек' : 'Контур'],
        ['pill', isKk() ? 'Капсула' : 'Капсула']
      ].forEach(([val, lbl]) => {
        pRow.append(makePill(lbl, priceStyle === val, () => {
          setNativeInput('design-price', val);
          renderFlyout('text');
        }));
      });
      flyoutEl.append(pRow);
    }

    if (toolId === 'photo') {
      flyoutEl.append(
        makeLiveSlider(isKk() ? 'Масштаб' : 'Масштаб', 'photo-zoom', '%'),
        makeLiveSlider(isKk() ? 'Жарықтық' : 'Яркость', 'photo-brightness', '%'),
        makeLiveSlider(isKk() ? 'Контраст' : 'Контраст', 'photo-contrast', '%'),
        makeLiveSlider(isKk() ? 'Дөңгелектеу' : 'Скругление', 'photo-radius', 'px')
      );

      const rotRow = document.createElement('div');
      rotRow.className = 'ft-grid-4';
      rotRow.append(
        makePill('↺ −90°', false, () => clickNative('rotate-left')),
        makePill('↻ +90°', false, () => clickNative('rotate-right')),
        makePill('⇄', $('photo-flip')?.checked, () => {
          const flip = $('photo-flip');
          if (flip) { setNativeInput('photo-flip', !flip.checked); renderFlyout('photo'); }
        }),
        makePill(isKk() ? 'Қалпына' : 'Сброс', false, () => { clickNative('reset-photo-button'); requestAnimationFrame(() => renderFlyout('photo')); })
      );
      flyoutEl.append(rotRow);

      flyoutEl.append(makeSectionLabel(isKk() ? 'Сүзгілер' : 'Фильтры'));
      const filterRow = document.createElement('div');
      filterRow.className = 'ft-grid-3';
      [
        ['original', isKk() ? 'Түпнұсқа' : 'Оригинал'],
        ['studio', 'Студия'],
        ['vivid', isKk() ? 'Ашық' : 'Яркий'],
        ['warm', isKk() ? 'Жылы' : 'Тёплый'],
        ['soft', isKk() ? 'Жұмсақ' : 'Мягкий'],
        ['mono', isKk() ? 'Ақ-қара' : 'Ч/Б']
      ].forEach(([key, lbl]) => {
        const nativeBtn = document.querySelector(`[data-photo-filter="${key}"]`);
        const pressed = nativeBtn?.getAttribute('aria-pressed') === 'true';
        filterRow.append(makePill(lbl, pressed, () => {
          nativeBtn?.click();
          requestAnimationFrame(() => renderFlyout('photo'));
        }));
      });
      flyoutEl.append(filterRow);

      const photoAct = document.createElement('div');
      photoAct.className = 'ft-grid-2';
      const rmBg = $('remove-background');
      photoAct.append(
        makePill(isKk() ? 'Фото жүктеу' : 'Загрузить фото', false, () => { $('photo-input')?.click(); }),
        makePill(isKk() ? 'Фонды өшіру' : 'Убрать фон', false, () => { clickNative('remove-background'); }, { disabled: rmBg ? rmBg.disabled : true })
      );
      flyoutEl.append(photoAct);
    }

    if (toolId === 'style') {
      flyoutEl.append(makeSectionLabel(isKk() ? 'Пішім' : 'Формат'));
      const fmtRow = document.createElement('div');
      fmtRow.className = 'ft-grid-4';
      [
        ['portrait', '4:5'],
        ['portrait34', '3:4'],
        ['square', '1:1'],
        ['story', '9:16']
      ].forEach(([key, lbl]) => {
        const nativePill = document.querySelector(`[data-format-pill="${key}"]`);
        const pressed = nativePill?.getAttribute('aria-pressed') === 'true';
        fmtRow.append(makePill(lbl, pressed, () => {
          nativePill?.click();
          requestAnimationFrame(() => renderFlyout('style'));
        }));
      });
      flyoutEl.append(fmtRow);

      flyoutEl.append(makeSectionLabel(isKk() ? 'Үлгілер' : 'Шаблоны'));
      const renderer = window.SATUCARD_RENDERER;
      const tplGrid = document.createElement('div');
      tplGrid.className = 'ft-grid-2';
      QUICK_STYLES.forEach(key => {
        const nativeTpl = document.querySelector(`#template-grid [data-template="${key}"]`);
        const tplInfo = renderer?.templates?.[key];
        if (!nativeTpl && !tplInfo) return;
        const pressed = nativeTpl?.getAttribute('aria-pressed') === 'true';
        tplGrid.append(makePill(tplInfo?.label || key, pressed, () => {
          nativeTpl?.click();
          requestAnimationFrame(() => renderFlyout('style'));
        }, { dotColor: tplInfo?.accent || tplInfo?.background }));
      });
      flyoutEl.append(tplGrid);

      flyoutEl.append(makeSectionLabel(isKk() ? 'Фон фактурасы' : 'Фактура фона'));
      const bdVal = $('design-backdrop')?.value || 'template';
      const bdRow = document.createElement('div');
      bdRow.className = 'ft-row';
      [
        ['solid', isKk() ? 'Тегіс' : 'Сплошной'],
        ['gradient', 'Градиент'],
        ['spotlight', isKk() ? 'Жарық' : 'Свет'],
        ['grid', isKk() ? 'Тор' : 'Сетка'],
        ['paper', isKk() ? 'Қағаз' : 'Бумага']
      ].forEach(([val, lbl]) => {
        bdRow.append(makePill(lbl, bdVal === val, () => {
          setNativeInput('design-backdrop', val);
          renderFlyout('style');
        }));
      });
      flyoutEl.append(bdRow);

      const extraRow = document.createElement('div');
      extraRow.className = 'ft-grid-3';
      const safeOn = $('safe-zone-toggle')?.getAttribute('aria-pressed') === 'true';
      const frameVal = $('design-frame')?.value || 'template';
      const shadowVal = $('design-shadow')?.value || 'template';
      extraRow.append(
        makePill(isKk() ? 'Жиек' : 'Рамка', frameVal === 'line' || frameVal === 'mat', () => {
          const next = frameVal === 'line' ? 'mat' : frameVal === 'mat' ? 'none' : 'line';
          setNativeInput('design-frame', next);
          renderFlyout('style');
        }),
        makePill(isKk() ? 'Көлеңке' : 'Тень', shadowVal === 'soft' || shadowVal === 'deep', () => {
          const next = shadowVal === 'soft' ? 'deep' : shadowVal === 'deep' ? 'none' : 'soft';
          setNativeInput('design-shadow', next);
          renderFlyout('style');
        }),
        makePill(isKk() ? 'Аймақ' : 'Зоны', safeOn, () => {
          clickNative('safe-zone-toggle');
          renderFlyout('style');
        })
      );
      flyoutEl.append(extraRow);
    }

    if (toolId === 'export') {
      const fmtVal = $('export-format')?.value || 'png';
      const scaleVal = $('export-scale')?.value || '1';

      flyoutEl.append(makeSectionLabel(isKk() ? 'Файл пішімі' : 'Формат файла'));
      const fmtRow = document.createElement('div');
      fmtRow.className = 'ft-grid-3';
      [
        ['png', 'PNG'],
        ['jpeg', 'JPG'],
        ['webp', 'WebP']
      ].forEach(([val, lbl]) => {
        fmtRow.append(makePill(lbl, fmtVal === val, () => {
          setNativeInput('export-format', val);
          renderFlyout('export');
        }));
      });
      flyoutEl.append(fmtRow);

      flyoutEl.append(makeSectionLabel(isKk() ? 'Сапа / Масштаб' : 'Масштаб'));
      const scaleRow = document.createElement('div');
      scaleRow.className = 'ft-grid-2';
      [
        ['1', '1× (Стандарт)'],
        ['2', '2× (HD)']
      ].forEach(([val, lbl]) => {
        scaleRow.append(makePill(lbl, scaleVal === val, () => {
          setNativeInput('export-scale', val);
          renderFlyout('export');
        }));
      });
      flyoutEl.append(scaleRow);

      const fmtLabel = fmtVal === 'jpeg' ? 'JPG' : fmtVal.toUpperCase();
      flyoutEl.append(
        makePill(
          isKk() ? `Жүктеп алу ${fmtLabel}` : `Скачать ${fmtLabel}`,
          false,
          () => { closeFlyout(); clickNative('download-button'); },
          { primary: true }
        )
      );

      const zipNative = $('download-set');
      const secRow = document.createElement('div');
      secRow.className = 'ft-grid-3';
      secRow.append(
        makePill(isKk() ? 'Көшіру' : 'Копировать', false, () => { closeFlyout(); clickNative('copy-card-image'); }),
        makePill('ZIP', false, () => { closeFlyout(); clickNative('download-set'); }, { disabled: zipNative ? zipNative.disabled : true }),
        makePill(isKk() ? 'Видео ↗' : 'В видео ↗', false, () => { closeFlyout(); clickNative('make-video-button'); })
      );
      flyoutEl.append(secRow);
    }

    // ==================== VIDEO STUDIO FLYOUTS ====================
    if (toolId === 'vformat') {
      flyoutEl.append(makeSectionLabel(isKk() ? 'Ролик пішімі' : 'Формат ролика'));
      const fmtRow = document.createElement('div');
      fmtRow.className = 'ft-grid-4';
      [
        ['vertical', '9:16'],
        ['marketplace34', '3:4'],
        ['square', '1:1'],
        ['wide', '16:9']
      ].forEach(([key, lbl]) => {
        const nativeBtn = document.querySelector(`[data-v-format="${key}"]`);
        const pressed = nativeBtn?.getAttribute('aria-pressed') === 'true';
        fmtRow.append(makePill(lbl, pressed, () => {
          nativeBtn?.click();
          requestAnimationFrame(() => renderFlyout('vformat'));
        }));
      });
      flyoutEl.append(fmtRow);

      flyoutEl.append(makeSectionLabel('FPS'));
      const fpsVal = $('fps')?.value || '30';
      const fpsRow = document.createElement('div');
      fpsRow.className = 'ft-grid-3';
      ['24', '30', '60'].forEach(val => {
        fpsRow.append(makePill(`${val} fps`, fpsVal === val, () => {
          setNativeInput('fps', val);
          renderFlyout('vformat');
        }));
      });
      flyoutEl.append(fpsRow);

      const safeEl = $('safe-zones');
      flyoutEl.append(
        makePill(isKk() ? 'Қауіпсіз аймақтар' : 'Безопасные зоны', Boolean(safeEl?.checked), () => {
          if (safeEl) {
            setNativeInput('safe-zones', !safeEl.checked);
            renderFlyout('vformat');
          }
        })
      );
    }

    if (toolId === 'vedit') {
      const g = document.createElement('div');
      g.className = 'ft-grid-2';
      g.append(
        makePill(isKk() ? 'Кесу' : 'Разрезать', false, () => clickNative('split')),
        makePill(isKk() ? 'Көшірме' : 'Дублировать', false, () => clickNative('duplicate')),
        makePill(isKk() ? 'Қабат ↑' : 'Слой выше ↑', false, () => clickNative('layer-up')),
        makePill(isKk() ? 'Қабат ↓' : 'Слой ниже ↓', false, () => clickNative('layer-down'))
      );
      flyoutEl.append(g);
      flyoutEl.append(
        makePill(isKk() ? 'Қабатты өшіру' : 'Удалить слой', false, () => {
          clickNative('delete-layer');
          closeFlyout();
        })
      );
    }

    if (toolId === 'nav') {
      const g = document.createElement('div');
      g.className = 'ft-grid-2';
      g.append(
        makeLinkPill(isKk() ? 'Редактор' : 'Редактор', 'editor.html'),
        makeLinkPill(isKk() ? 'Үлгілер' : 'Шаблоны', 'examples.html'),
        makeLinkPill(isKk() ? 'Басты бет' : 'Главная', 'index.html'),
        makeLinkPill(isKk() ? 'Тарифтер' : 'Тарифы', 'pricing.html'),
        makeLinkPill(isKk() ? 'Кабинет' : 'Кабинет', 'dashboard.html'),
        makePill(isKk() ? 'Тақырып ◐' : 'Тема ◐', false, () => {
          document.querySelector('[data-theme-toggle]')?.click();
        })
      );
      flyoutEl.append(g);
    }
  }

  function openFlyout(toolId) {
    if (collapsed) setCollapsed(false);
    hideTip();
    if (openFlyoutId === toolId) {
      closeFlyout();
      return;
    }
    openFlyoutId = toolId;
    activeTool = toolId;
    renderFlyout(toolId);
    flyoutEl.hidden = false;
    positionFlyout();
    requestAnimationFrame(() => flyoutEl.classList.add('is-open'));
    syncButtonStates();
    syncPlate(false);
  }

  // ---- Button State Synchronization ----
  function syncButtonStates() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    const cropOn = $('crop-photo')?.getAttribute('aria-pressed') === 'true';
    const focusOn = $('canvas-focus-mode')?.getAttribute('aria-pressed') === 'true';
    const saiOpen = $('open-ai-chat')?.getAttribute('aria-expanded') === 'true';
    const isPlaying = $('play')?.textContent?.includes('⏸') || $('play')?.classList.contains('is-playing');

    slotButtons.forEach((btn, id) => {
      if (id === 'collapse') {
        const nextIcon = collapsed ? 'expand' : 'collapse';
        if (btn.dataset.ftIcon !== nextIcon) {
          btn.dataset.ftIcon = nextIcon;
          btn.innerHTML = collapsed ? ICONS.expand : ICONS.collapse;
        }
        btn.setAttribute('aria-label', t(nextIcon));
        btn.setAttribute('aria-pressed', String(collapsed));
        btn.classList.toggle('ft-btn-accent', collapsed);
        return;
      }
      if (id === 'theme') {
        const nextIcon = isDark ? 'dark' : 'light';
        if (btn.dataset.ftIcon !== nextIcon) {
          btn.dataset.ftIcon = nextIcon;
          btn.innerHTML = isDark ? ICONS.themeDark : ICONS.themeLight;
        }
        btn.setAttribute('aria-label', t('theme'));
        return;
      }
      if (id === 'lang') {
        const badge = btn.querySelector('.ft-lang-badge');
        const nextLang = isKk() ? 'KZ' : 'RU';
        if (badge && badge.textContent !== nextLang) badge.textContent = nextLang;
        btn.setAttribute('aria-label', t('lang'));
        return;
      }
      if (id === 'play') {
        const nextIcon = isPlaying ? 'pause' : 'play';
        if (btn.dataset.ftIcon !== nextIcon) {
          btn.dataset.ftIcon = nextIcon;
          btn.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
        }
        btn.setAttribute('aria-label', t('play'));
        btn.setAttribute('aria-pressed', String(Boolean(isPlaying)));
        btn.classList.toggle('is-active', activeTool === 'play');
        return;
      }

      let pressed = false;
      if (mode === 'editor') {
        if (id === 'crop') pressed = openFlyoutId === 'crop' || (cropOn && !openFlyoutId);
        else if (id === 'focus') pressed = focusOn;
        else if (id === 'sai') pressed = saiOpen;
        else if (id === 'undo' || id === 'redo') pressed = false;
        else pressed = openFlyoutId === id;
      } else if (mode === 'video') {
        pressed = openFlyoutId === id;
      } else {
        pressed = activeTool === id;
      }

      if (btn.tagName === 'BUTTON') btn.setAttribute('aria-pressed', String(pressed));
      else btn.setAttribute('aria-current', pressed ? 'page' : 'false');
      btn.classList.toggle('is-active', activeTool === id);
      btn.setAttribute('aria-label', t(id));
    });

    if (mode === 'editor') {
      const undoBtn = slotButtons.get('undo');
      const redoBtn = slotButtons.get('redo');
      if (undoBtn && $('undo-button')) undoBtn.disabled = $('undo-button').disabled;
      if (redoBtn && $('redo-button')) redoBtn.disabled = $('redo-button').disabled;
    } else if (mode === 'video') {
      const undoBtn = slotButtons.get('vundo');
      const redoBtn = slotButtons.get('vredo');
      if (undoBtn && $('undo')) undoBtn.disabled = $('undo').disabled;
      if (redoBtn && $('redo')) redoBtn.disabled = $('redo').disabled;
    }
  }

  // ---- Wire Dock Tool Interactions ----
  slotButtons.forEach((btn, id) => {
    let pressTimer = 0;
    let longPressed = false;
    const toolMeta = TOOLS.find(x => x.id === id);

    btn.addEventListener('pointerenter', () => {
      const labelKey = id === 'collapse' ? (collapsed ? 'expand' : 'collapse') : id;
      showTip(btn, t(labelKey), toolMeta?.key);
    });
    btn.addEventListener('pointerleave', () => { clearTimeout(pressTimer); hideTip(); });
    btn.addEventListener('blur', hideTip);
    btn.addEventListener('focus', () => {
      if (btn.matches(':focus-visible')) {
        const labelKey = id === 'collapse' ? (collapsed ? 'expand' : 'collapse') : id;
        showTip(btn, t(labelKey), toolMeta?.key);
      }
    });

    if (id === 'collapse') {
      btn.addEventListener('click', () => setCollapsed(!collapsed));
      return;
    }

    if (mode === 'editor') {
      if (id === 'crop') {
        btn.addEventListener('pointerdown', ev => {
          hideTip();
          if (ev.button !== 0) return;
          longPressed = false;
          clearTimeout(pressTimer);
          pressTimer = setTimeout(() => {
            longPressed = true;
            openFlyout('crop');
          }, LONG_PRESS);
        });
        btn.addEventListener('pointerup', () => clearTimeout(pressTimer));
        btn.addEventListener('pointercancel', () => clearTimeout(pressTimer));
        btn.addEventListener('click', () => {
          if (longPressed) { longPressed = false; return; }
          activeTool = 'crop';
          clickNative('crop-photo');
          openFlyout('crop');
        });
      } else if (id === 'sai') {
        btn.addEventListener('click', () => {
          activeTool = 'sai';
          closeFlyout();
          const chatEl = $('ai-chat');
          const chatApi = window.__SATUCARD_AI_CHAT;
          if (chatEl && !chatEl.hidden && chatApi?.setCollapsed) {
            chatApi.setCollapsed(!chatEl.classList.contains('is-collapsed'));
          } else {
            clickNative('open-ai-chat');
          }
          syncButtonStates();
          syncPlate(false);
        });
      } else if (id === 'undo') {
        btn.addEventListener('click', () => { closeFlyout(); clickNative('undo-button'); syncButtonStates(); });
      } else if (id === 'redo') {
        btn.addEventListener('click', () => { closeFlyout(); clickNative('redo-button'); syncButtonStates(); });
      } else if (id === 'focus') {
        btn.addEventListener('click', () => {
          activeTool = 'focus';
          closeFlyout();
          clickNative('canvas-focus-mode');
          syncButtonStates();
          syncPlate(false);
        });
      } else {
        btn.addEventListener('click', () => openFlyout(id));
      }
      return;
    }

    if (mode === 'video') {
      if (id === 'play') {
        btn.addEventListener('click', () => { activeTool = 'play'; closeFlyout(); clickNative('play'); requestAnimationFrame(syncButtonStates); syncPlate(false); });
      } else if (id === 'prev') {
        btn.addEventListener('click', () => { closeFlyout(); clickNative('previous'); });
      } else if (id === 'next') {
        btn.addEventListener('click', () => { closeFlyout(); clickNative('next'); });
      } else if (id === 'vundo') {
        btn.addEventListener('click', () => { closeFlyout(); clickNative('undo'); syncButtonStates(); });
      } else if (id === 'vredo') {
        btn.addEventListener('click', () => { closeFlyout(); clickNative('redo'); syncButtonStates(); });
      } else if (id === 'vexport') {
        btn.addEventListener('click', () => { activeTool = 'vexport'; closeFlyout(); clickNative('export'); syncPlate(false); });
      } else {
        btn.addEventListener('click', () => openFlyout(id));
      }
      return;
    }

    // Site mode actions
    if (id === 'templates' && $('template-cmd-trigger')) {
      btn.addEventListener('click', () => {
        activeTool = 'templates';
        clickNative('template-cmd-trigger');
        syncPlate(false);
      });
    } else if (id === 'theme') {
      btn.addEventListener('click', () => {
        document.querySelector('[data-theme-toggle]')?.click();
        requestAnimationFrame(syncButtonStates);
      });
    } else if (id === 'lang') {
      btn.addEventListener('click', () => {
        const next = isKk() ? 'ru' : 'kk';
        if (window.SATUCARD_LANGUAGE?.setLanguage) {
          window.SATUCARD_LANGUAGE.setLanguage(next);
        }
        requestAnimationFrame(syncButtonStates);
      });
    }
  });

  grip.addEventListener('pointerenter', () => showTip(grip, t('drag'), ''));
  grip.addEventListener('pointerleave', hideTip);
  grip.addEventListener('blur', hideTip);

  // Roving focus along dock
  dock.addEventListener('keydown', ev => {
    const items = [...dock.querySelectorAll('[data-ft-item]:not(:disabled)')].filter(el => el.offsetParent !== null);
    const idx = items.indexOf(ev.target);
    if (idx === -1) return;
    const vert = wrap.classList.contains('is-vertical');
    let next = -1;
    if (ev.key === (vert ? 'ArrowDown' : 'ArrowRight')) next = (idx + 1) % items.length;
    else if (ev.key === (vert ? 'ArrowUp' : 'ArrowLeft')) next = (idx - 1 + items.length) % items.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = items.length - 1;
    if (next !== -1) {
      ev.preventDefault();
      items.forEach((el, i) => { el.tabIndex = i === next ? 0 : -1; });
      items[next].focus();
    }
  });

  // Close flyout / upsell on outside click
  document.addEventListener('pointerdown', ev => {
    if (openFlyoutId && !flyoutEl.contains(ev.target) && !wrap.contains(ev.target)) {
      closeFlyout();
    }
    if (upsellBox && !upsellBox.hidden && !upsellBox.contains(ev.target) && (!toggleBtn || !toggleBtn.contains(ev.target))) {
      upsellBox.hidden = true;
    }
  });

  // Viewport-wide keyboard shortcuts (never while typing or when AI chat is open!)
  window.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') {
      if (openFlyoutId) { closeFlyout(); return; }
      if (upsellBox && !upsellBox.hidden) { upsellBox.hidden = true; return; }
    }
    if (!unlocked || !enabledByUser || wrap.hidden || collapsed) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.repeat || ev.defaultPrevented || isTyping(ev)) return;
    const aiChat = $('ai-chat');
    if (aiChat && !aiChat.hidden && !aiChat.classList.contains('is-collapsed')) return;

    const k = ev.key.toLowerCase();
    if (mode === 'editor') {
      if (k === 'v') { ev.preventDefault(); slotButtons.get('crop')?.click(); }
      else if (k === 'p') { ev.preventDefault(); openFlyout('colors'); }
      else if (k === 't') { ev.preventDefault(); openFlyout('text'); }
      else if (k === 'i') { ev.preventDefault(); openFlyout('photo'); }
      else if (k === 'f') { ev.preventDefault(); openFlyout('style'); }
      else if (k === 'a') { ev.preventDefault(); slotButtons.get('sai')?.click(); }
      else if (k === 'h') { ev.preventDefault(); slotButtons.get('focus')?.click(); }
      else if (k === 'e') { ev.preventDefault(); openFlyout('export'); }
    } else if (mode === 'video') {
      if (k === 'f') { ev.preventDefault(); openFlyout('vformat'); }
      else if (k === 'm') { ev.preventDefault(); openFlyout('vedit'); }
      else if (k === 'e') { ev.preventDefault(); slotButtons.get('vexport')?.click(); }
      else if (k === 'g') { ev.preventDefault(); openFlyout('nav'); }
    }
  });

  // Observe native button states (Undo/Redo, Crop, Focus, sAI, Video Play, Theme)
  const observedIds = mode === 'editor'
    ? ['undo-button', 'redo-button', 'crop-photo', 'canvas-focus-mode', 'open-ai-chat']
    : mode === 'video'
      ? ['undo', 'redo', 'play']
      : [];

  for (const id of observedIds) {
    const el = $(id);
    if (!el) continue;
    new MutationObserver(() => syncButtonStates()).observe(el, {
      attributes: true,
      childList: id === 'play',
      characterData: id === 'play',
      attributeFilter: ['disabled', 'aria-pressed', 'aria-expanded', 'class']
    });
  }

  let lastTheme = document.documentElement.dataset.theme;
  new MutationObserver(() => {
    const cur = document.documentElement.dataset.theme;
    if (cur !== lastTheme) {
      lastTheme = cur;
      syncButtonStates();
    }
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });

  window.addEventListener('resize', () => {
    if (!dragging && !wrap.hidden) settleDock(null);
  }, { passive: true });

  // ---- Optional Editor Header Toggle & Server-Truthful Entitlement via /api/billing ----
  function updateVisibility() {
    const visible = unlocked && enabledByUser;
    wrap.hidden = !visible;
    if (toggleBtn) {
      toggleBtn.classList.toggle('is-unlocked', unlocked);
      toggleBtn.setAttribute('aria-pressed', String(visible));
    }
    if (visible) {
      if (upsellBox) upsellBox.hidden = true;
      syncButtonStates();
      requestAnimationFrame(() => settleDock(null));
    } else {
      closeFlyout();
      hideTip();
      hideSnapGhost();
      publishDockLayout();
    }
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (!unlocked) {
        if (upsellBox) upsellBox.hidden = !upsellBox.hidden;
        return;
      }
      enabledByUser = !enabledByUser;
      try { localStorage.setItem(STORAGE_ENABLED, enabledByUser ? '1' : '0'); } catch (_) {}
      updateVisibility();
    });
  }

  upsellBox?.querySelector('.ft-upsell-close')?.addEventListener('click', () => {
    if (upsellBox) upsellBox.hidden = true;
  });

  let checkGeneration = 0;
  async function checkEntitlement() {
    const token = ++checkGeneration;
    try {
      if (location.protocol === 'file:') {
        unlocked = false;
        planName = '';
        updateVisibility();
        return;
      }
      const session = await window.SATUCARD_AUTH?.getSession?.().catch(() => null);
      if (token !== checkGeneration) return;
      if (!session?.access_token) {
        unlocked = false;
        planName = '';
        updateVisibility();
        return;
      }
      const res = await fetch('api/billing', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${session.access_token}` },
        ...(typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(8000) } : {})
      });
      if (token !== checkGeneration) return;
      const data = res.ok ? await res.json().catch(() => ({})) : {};
      unlocked = data.fastToolbar === true || data.isAdmin === true || Boolean(data.active);
      planName = data.isAdmin ? 'Admin' : (data.active?.planName || data.active?.planId || '');
      updateVisibility();
    } catch (_) {
      if (token !== checkGeneration) return;
      unlocked = false;
      planName = '';
      updateVisibility();
    }
  }

  document.addEventListener('satucard:authchange', () => { checkEntitlement(); });
  document.addEventListener('satucard:language-change', () => {
    syncButtonStates();
    if (openFlyoutId) renderFlyout(openFlyoutId);
  });

  // Expose read-only diagnostics & testing bridge
  window.__SATUCARD_FAST_TOOLBAR = {
    getState: () => ({
      mode,
      unlocked,
      enabledByUser,
      visible: !wrap.hidden,
      collapsed,
      edge,
      vertical: wrap.classList.contains('is-vertical'),
      activeTool,
      openFlyoutId,
      planName,
      activeTickers: tickers.size,
      mountedOnBody: wrap.parentElement === document.body
    }),
    dockTo: next => { if (unlocked && !wrap.hidden) dockTo(next, { x: 0, y: 0 }); },
    setCollapsed: next => { if (unlocked && !wrap.hidden) setCollapsed(next); },
    openFlyout: id => { if (unlocked && !wrap.hidden) openFlyout(id); },
    recheck: checkEntitlement
  };

  // Boot cleanly
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { updateVisibility(); checkEntitlement(); }, { once: true });
  } else {
    updateVisibility();
    checkEntitlement();
  }
})();
