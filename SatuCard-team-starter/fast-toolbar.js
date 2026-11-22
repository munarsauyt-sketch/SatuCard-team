'use strict';

// SatuCard Fast Toolbar (Tool Dock) — Unlocked on paid plans ("ИИ Старт" 1 500 ₸+) and Admin.
// Ported from Kokonut UI Tool Dock physics to pure vanilla JS + SatuCard v4 design system.
// 0% idle GPU/CPU (self-sleeping RAF loop, pauses on document.hidden, GPU transform/opacity only).
(() => {
  const $ = id => document.getElementById(id);
  const stage = $('preview-stage');
  const toggleBtn = $('fast-toolbar-toggle');
  const upsellBox = $('fast-toolbar-upsell');
  if (!stage || !toggleBtn || !upsellBox) return;

  const EDGE_GAP = 12;
  const TIP_DELAY = 400;
  const TIP_WARM = 300;
  const TIP_OFFSET = 10;
  const LONG_PRESS = 350;
  const DECELERATION = 0.998;
  const PROJECTION = DECELERATION / (1 - DECELERATION);
  const VELOCITY_WINDOW = 100;
  const NEXT_EDGE = { bottom: 'left', left: 'top', top: 'right', right: 'bottom' };
  const STORAGE_EDGE = 'satucard-fast-toolbar-edge';
  const STORAGE_ENABLED = 'satucard-fast-toolbar-enabled';
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

  // ---- Geometry helpers (ported from Kokonut UI Tool Dock) ----
  function edgeTarget(edge, W, H, w, h) {
    if (edge === 'top') return { x: W / 2, y: EDGE_GAP + h / 2 };
    if (edge === 'left') return { x: EDGE_GAP + w / 2, y: H / 2 };
    if (edge === 'right') return { x: W - EDGE_GAP - w / 2, y: H / 2 };
    return { x: W / 2, y: H - EDGE_GAP - h / 2 };
  }

  function nearestEdge(x, y, W, H) {
    const candidates = [
      ['bottom', H - y],
      ['top', y],
      ['left', x],
      ['right', W - x]
    ];
    let best = candidates[0];
    for (const c of candidates) {
      if (c[1] < best[1]) best = c;
    }
    return best[0];
  }

  function reflowStart(edge, x, y, from, to, W, H) {
    let nx = x;
    let ny = y;
    if (edge === 'left') nx = x - from.w / 2 + to.w / 2;
    else if (edge === 'right') nx = x + from.w / 2 - to.w / 2;
    else if (edge === 'top') ny = y - from.h / 2 + to.h / 2;
    else ny = y + from.h / 2 - to.h / 2;
    return {
      x: clamp(nx, to.w / 2 + 4, W - to.w / 2 - 4),
      y: clamp(ny, to.h / 2 + 4, H - to.h / 2 - 4)
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

  // ---- Editor native control helpers (zero state duplication!) ----
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

  // ---- Localized labels ----
  const LABELS = {
    drag: ['Перетяните к краю холста', 'Кенеп шетіне сүйреңіз'],
    crop: ['Кадрирование', 'Кадрлау'],
    colors: ['Палитра и цвета', 'Палитра және түстер'],
    text: ['Текст и шрифт', 'Мәтін және қаріп'],
    photo: ['Фото и свет', 'Фото және жарық'],
    style: ['Стиль и формат', 'Стиль және пішім'],
    undo: ['Отменить', 'Болдырмау'],
    redo: ['Повторить', 'Қайталау'],
    focus: ['Фокус на холсте', 'Кенепке фокус']
  };
  const t = key => (isKk() ? LABELS[key]?.[1] : LABELS[key]?.[0]) || key;

  // ---- SVG Icons ----
  const ICONS = {
    gripV: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="6" cy="4" r="1.1" fill="currentColor" stroke="none"/><circle cx="10" cy="4" r="1.1" fill="currentColor" stroke="none"/><circle cx="6" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="10" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="6" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="10" cy="12" r="1.1" fill="currentColor" stroke="none"/></svg>',
    gripH: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="4" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="8" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="4" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="8" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="10" r="1.1" fill="currentColor" stroke="none"/></svg>',
    crop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>',
    colors: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13.5" cy="6.5" r="1" fill="currentColor"/><circle cx="17.5" cy="10.5" r="1" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1" fill="currentColor"/><circle cx="6.5" cy="12.5" r="1" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.75 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9z"/></svg>',
    text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>',
    photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
    style: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 4 9l5 5"/><path d="M4 9h9a7 7 0 0 1 0 14"/></svg>',
    redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5-5 5"/><path d="M20 9h-9a7 7 0 0 0 0 14"/></svg>',
    focus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    caret: '<svg class="ft-corner-caret" viewBox="0 0 5 5" aria-hidden="true"><path d="M5 0V5H0Z" fill="currentColor" stroke="none"/></svg>'
  };

  // ---- Build Dock DOM inside #preview-stage ----
  const wrap = document.createElement('div');
  wrap.className = 'ft-dock-wrap';
  wrap.id = 'fast-toolbar-dock';
  wrap.dataset.edge = 'bottom';
  wrap.hidden = true;

  const dock = document.createElement('div');
  dock.className = 'ft-dock';
  dock.setAttribute('role', 'toolbar');
  dock.setAttribute('aria-label', 'Быстрый тулбар редактора');
  dock.setAttribute('aria-orientation', 'horizontal');

  const plate = document.createElement('span');
  plate.className = 'ft-plate';
  plate.setAttribute('aria-hidden', 'true');

  const grip = document.createElement('button');
  grip.type = 'button';
  grip.className = 'ft-grip';
  grip.setAttribute('data-ft-item', 'grip');
  grip.setAttribute('aria-label', 'Переместить быстрый тулбар');
  grip.innerHTML = ICONS.gripV;

  const div1 = document.createElement('span');
  div1.className = 'ft-divider';
  div1.setAttribute('aria-hidden', 'true');

  const TOOLS = [
    { id: 'crop', key: 'V', icon: ICONS.crop, hasFlyout: true },
    { id: 'colors', key: 'P', icon: ICONS.colors, hasFlyout: true },
    { id: 'text', key: 'T', icon: ICONS.text, hasFlyout: true },
    { id: 'photo', key: 'I', icon: ICONS.photo, hasFlyout: true },
    { id: 'style', key: 'F', icon: ICONS.style, hasFlyout: true },
    { id: 'divider' },
    { id: 'undo', key: 'Ctrl+Z', icon: ICONS.undo, hasFlyout: false },
    { id: 'redo', key: 'Ctrl+Y', icon: ICONS.redo, hasFlyout: false },
    { id: 'focus', key: 'H', icon: ICONS.focus, hasFlyout: false }
  ];

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
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ft-btn';
    btn.dataset.ftTool = item.id;
    btn.setAttribute('data-ft-item', item.id);
    btn.setAttribute('aria-label', t(item.id));
    if (item.key && item.key.length === 1) btn.setAttribute('aria-keyshortcuts', item.key);
    btn.setAttribute('aria-pressed', 'false');
    btn.tabIndex = -1;
    btn.innerHTML = item.icon + (item.hasFlyout ? ICONS.caret : '');
    slot.append(btn);
    dock.append(slot);
    slotButtons.set(item.id, btn);
  });

  // Tooltip bubble + Flyout container (both live inside #preview-stage for clean bounds clamping)
  const tipEl = document.createElement('div');
  tipEl.className = 'ft-tip';
  tipEl.setAttribute('aria-hidden', 'true');

  const flyoutEl = document.createElement('div');
  flyoutEl.className = 'ft-flyout';
  flyoutEl.id = 'fast-toolbar-flyout';
  flyoutEl.setAttribute('role', 'dialog');
  flyoutEl.hidden = true;

  wrap.append(dock);
  stage.append(wrap, tipEl, flyoutEl);

  // ---- State ----
  let unlocked = false;
  let planName = '';
  let enabledByUser = true;
  try {
    const savedEnabled = localStorage.getItem(STORAGE_ENABLED);
    if (savedEnabled === '0') enabledByUser = false;
  } catch (_) {}

  let edge = 'bottom';
  try {
    const savedEdge = localStorage.getItem(STORAGE_EDGE);
    if (savedEdge && ['bottom', 'top', 'left', 'right'].includes(savedEdge)) edge = savedEdge;
  } catch (_) {}

  let activeTool = 'crop';
  let openFlyoutId = null;
  let dragging = false;
  let dragState = null;
  let hoverInStage = false;
  let bounds = { W: 0, H: 0, w: 0, h: 0 };

  const sX = makeSpring(0, 380, 32, 1, 0.12);
  const sY = makeSpring(0, 380, 32, 1, 0.12);
  const sPlateX = makeSpring(0, 460, 34, 1, 0.08);
  const sPlateY = makeSpring(0, 460, 34, 1, 0.08);
  let plateReady = false;

  // ---- Tooltip group (400ms first delay, 300ms warm window) ----
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
    const sRect = stage.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    const dRect = dock.getBoundingClientRect();
    const tW = tipEl.offsetWidth || 100;
    const tH = tipEl.offsetHeight || 26;
    const bMidX = bRect.left + bRect.width / 2 - sRect.left;
    const bMidY = bRect.top + bRect.height / 2 - sRect.top;
    let x = bMidX - tW / 2;
    let y = dRect.top - sRect.top - tH - TIP_OFFSET;

    if (edge === 'top') {
      y = dRect.bottom - sRect.top + TIP_OFFSET;
    } else if (edge === 'left') {
      x = dRect.right - sRect.left + TIP_OFFSET;
      y = bMidY - tH / 2;
    } else if (edge === 'right') {
      x = dRect.left - sRect.left - tW - TIP_OFFSET;
      y = bMidY - tH / 2;
    }
    x = clamp(x, 8, Math.max(8, stage.clientWidth - tW - 8));
    y = clamp(y, 8, Math.max(8, stage.clientHeight - tH - 8));
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

  // ---- Dock & Plate motion ----
  function paintDock() {
    const cx = clamp(sX.x, bounds.w / 2 + 4, bounds.W - bounds.w / 2 - 4);
    const cy = clamp(sY.x, bounds.h / 2 + 4, bounds.H - bounds.h / 2 - 4);
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
    const btn = slotButtons.get(activeTool);
    if (!btn || wrap.hidden) return;
    const dRect = dock.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    if (!bRect.width) return;
    const tx = bRect.left - dRect.left - dock.clientLeft;
    const ty = bRect.top - dRect.top - dock.clientTop;
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
      wake(tickPlate);
    }
  }

  function applyEdgeClass(nextEdge) {
    const vert = isVertical(nextEdge) && stage.clientWidth >= 520;
    wrap.dataset.edge = nextEdge;
    wrap.classList.toggle('is-vertical', vert);
    dock.setAttribute('aria-orientation', vert ? 'vertical' : 'horizontal');
    grip.innerHTML = vert ? ICONS.gripH : ICONS.gripV;
  }

  function settleDock(velocity = null) {
    if (wrap.hidden) return;
    applyEdgeClass(edge);
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const w = dock.offsetWidth || 320;
    const h = dock.offsetHeight || 46;
    bounds = { W, H, w, h };
    const target = edgeTarget(edge, W, H, w, h);
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
  }

  function dockTo(nextEdge, velocity = { x: 0, y: 0 }) {
    const normalized = stage.clientWidth < 520 && isVertical(nextEdge) ? 'bottom' : nextEdge;
    const prevSize = { w: dock.offsetWidth, h: dock.offsetHeight };
    const changed = normalized !== edge;
    edge = normalized;
    try { localStorage.setItem(STORAGE_EDGE, edge); } catch (_) {}
    if (changed) {
      applyEdgeClass(edge);
      const nextSize = { w: dock.offsetWidth, h: dock.offsetHeight };
      if (prevSize.w !== nextSize.w || prevSize.h !== nextSize.h) {
        const start = reflowStart(edge, sX.x, sY.x, prevSize, nextSize, stage.clientWidth, stage.clientHeight);
        sX.x = start.x;
        sY.x = start.y;
      }
    }
    settleDock(velocity);
  }

  // ---- Dragging the dock via grip ----
  grip.addEventListener('pointerdown', ev => {
    if (ev.button !== 0 || wrap.hidden) return;
    ev.preventDefault();
    grip.setPointerCapture?.(ev.pointerId);
    tickers.delete(tickDock);
    hideTip();
    closeFlyout();
    const r = stage.getBoundingClientRect();
    const x = clamp(sX.x, bounds.w / 2 + 4, bounds.W - bounds.w / 2 - 4);
    const curY = clamp(sY.x, bounds.h / 2 + 4, bounds.H - bounds.h / 2 - 4);
    sX.x = x; sY.x = curY;
    dragState = {
      dx: ev.clientX - r.left - x,
      dy: ev.clientY - r.top - curY,
      left: r.left,
      top: r.top,
      samples: [{ t: ev.timeStamp, x, y: curY, cx: x, cy: curY }]
    };
    dragging = true;
    wrap.classList.add('is-dragging');
  });

  grip.addEventListener('pointermove', ev => {
    if (!dragState) return;
    const hw = (dock.offsetWidth || 320) / 2;
    const hh = (dock.offsetHeight || 46) / 2;
    const rawX = ev.clientX - dragState.left - dragState.dx;
    const rawY = ev.clientY - dragState.top - dragState.dy;
    const drawnX = clamp(rawX, hw + 4, stage.clientWidth - hw - 4);
    const drawnY = clamp(rawY, hh + 4, stage.clientHeight - hh - 4);
    sX.x = drawnX;
    sY.x = drawnY;
    paintDock();
    dragState.samples.push({ t: ev.timeStamp, x: rawX, y: rawY, cx: drawnX, cy: drawnY });
    if (dragState.samples.length > 8) dragState.samples.shift();
  });

  function finishGripDrag(ev) {
    if (!dragState) return;
    const d = dragState;
    dragState = null;
    dragging = false;
    wrap.classList.remove('is-dragging');
    const last = d.samples[d.samples.length - 1] || { x: sX.x, y: sY.x, t: ev.timeStamp };
    const paused = ev.timeStamp - last.t > 55;
    const rawV = paused ? { x: 0, y: 0, cx: 0, cy: 0 } : releaseVelocity(d.samples, ev.timeStamp);
    // Preserve throw angle while capping synthetic velocity spikes
    const speed = Math.hypot(rawV.x, rawV.y);
    const scale = speed > 2.2 ? 2.2 / speed : 1;
    const vx = rawV.x * scale;
    const vy = rawV.y * scale;
    const cSpeed = Math.hypot(rawV.cx, rawV.cy);
    const cScale = cSpeed > 2.2 ? 2.2 / cSpeed : 1;
    const vcx = rawV.cx * cScale;
    const vcy = rawV.cy * cScale;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const projMs = Math.min(PROJECTION, 160);
    // Do NOT clamp px/py before nearestEdge so deeper wall crossings win corners cleanly!
    const px = last.x + vx * projMs;
    const py = last.y + vy * projMs;
    dockTo(nearestEdge(px, py, W, H), { x: vcx * 1000, y: vcy * 1000 });
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

  // ---- Flyout Positioning & Rendering ----
  function positionFlyout() {
    if (!openFlyoutId || flyoutEl.hidden) return;
    const sRect = stage.getBoundingClientRect();
    const dRect = dock.getBoundingClientRect();
    const btn = slotButtons.get(openFlyoutId);
    const bRect = btn ? btn.getBoundingClientRect() : dRect;
    const fW = flyoutEl.offsetWidth || 248;
    const fH = flyoutEl.offsetHeight || 180;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    let x = bRect.left + bRect.width / 2 - sRect.left - fW / 2;
    let y = dRect.top - sRect.top - fH - 10;
    let origin = '50% 100%';

    if (edge === 'top') {
      y = dRect.bottom - sRect.top + 10;
      origin = '50% 0%';
    } else if (edge === 'left') {
      x = dRect.right - sRect.left + 10;
      y = bRect.top + bRect.height / 2 - sRect.top - fH / 2;
      origin = '0% 50%';
    } else if (edge === 'right') {
      x = dRect.left - sRect.left - fW - 10;
      y = bRect.top + bRect.height / 2 - sRect.top - fH / 2;
      origin = '100% 50%';
    }

    x = clamp(x, 10, Math.max(10, W - fW - 10));
    y = clamp(y, 10, Math.max(10, H - fH - 10));
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

  function makePill(label, pressed, onClick, extraDotColor) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ft-pill';
    b.setAttribute('aria-pressed', String(Boolean(pressed)));
    if (extraDotColor) {
      const dot = document.createElement('i');
      dot.className = 'ft-style-dot';
      dot.style.background = extraDotColor;
      b.append(dot);
    }
    const span = document.createElement('span');
    span.textContent = label;
    b.append(span);
    b.addEventListener('click', onClick);
    return b;
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

  function renderFlyout(toolId) {
    flyoutEl.replaceChildren();
    flyoutEl.setAttribute('aria-label', t(toolId));
    const head = document.createElement('div');
    head.className = 'ft-flyout-head';
    const title = document.createElement('span');
    title.className = 'ft-flyout-title';
    title.textContent = t(toolId);
    const sub = document.createElement('span');
    sub.className = 'ft-flyout-sub';
    sub.textContent = TOOLS.find(x => x.id === toolId)?.key || '';
    head.append(title, sub);
    flyoutEl.append(head);

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
    }

    if (toolId === 'colors') {
      // 10 diverse live palette swatches (5 light + 5 dark) directly from #palette-grid!
      const allPal = [...document.querySelectorAll('#palette-grid [data-palette]')];
      const lightPal = allPal.filter(b => b.dataset.tone === 'light').slice(0, 5);
      const darkPal = allPal.filter(b => b.dataset.tone === 'dark').slice(0, 5);
      const palButtons = [...lightPal, ...darkPal];
      if (palButtons.length < 10) {
        for (const b of allPal) {
          if (palButtons.length >= 10) break;
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
        inp.addEventListener('change', () => setNativeInput(nativeId, inp.value, true));
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
    }

    if (toolId === 'text') {
      flyoutEl.append(makeLiveSlider(isKk() ? 'Мәтін өлшемі' : 'Размер текста', 'text-scale', '%'));

      const alignVal = $('text-align')?.value || 'left';
      const caseVal = $('design-title-case')?.value || 'template';
      const row1 = document.createElement('div');
      row1.className = 'ft-grid-2';
      row1.append(
        makePill(isKk() ? 'Сол жақ' : 'Слева', alignVal === 'left', () => { setNativeInput('text-align', 'left'); renderFlyout('text'); }),
        makePill(isKk() ? 'Ортаға' : 'По центру', alignVal === 'center', () => { setNativeInput('text-align', 'center'); renderFlyout('text'); })
      );
      flyoutEl.append(row1);

      const weightVal = $('design-title-weight')?.value || 'template';
      const row2 = document.createElement('div');
      row2.className = 'ft-grid-4';
      row2.append(
        makePill('Aa', caseVal !== 'upper', () => { setNativeInput('design-title-case', 'original'); renderFlyout('text'); }),
        makePill('AA', caseVal === 'upper', () => { setNativeInput('design-title-case', 'upper'); renderFlyout('text'); }),
        makePill('B', weightVal === 'bold', () => { setNativeInput('design-title-weight', 'bold'); renderFlyout('text'); }),
        makePill('B+', weightVal === 'heavy', () => { setNativeInput('design-title-weight', 'heavy'); renderFlyout('text'); })
      );
      flyoutEl.append(row2);

      const jumpRow = document.createElement('div');
      jumpRow.className = 'ft-grid-2';
      jumpRow.append(
        makePill(isKk() ? 'Атауы ↗' : 'Название ↗', false, () => {
          clickNative('tab-content');
          closeFlyout();
          requestAnimationFrame(() => $('product-name')?.focus());
        }),
        makePill(isKk() ? 'Бағасы ₸ ↗' : 'Цена ₸ ↗', false, () => {
          clickNative('tab-content');
          closeFlyout();
          requestAnimationFrame(() => $('product-price')?.focus());
        })
      );
      flyoutEl.append(jumpRow);
    }

    if (toolId === 'photo') {
      flyoutEl.append(
        makeLiveSlider(isKk() ? 'Масштаб' : 'Масштаб', 'photo-zoom', '%'),
        makeLiveSlider(isKk() ? 'Жарықтық' : 'Яркость', 'photo-brightness', '%'),
        makeLiveSlider(isKk() ? 'Контраст' : 'Контраст', 'photo-contrast', '%')
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

      const filterRow = document.createElement('div');
      filterRow.className = 'ft-row';
      [
        ['original', isKk() ? 'Түпнұсқа' : 'Оригинал'],
        ['studio', 'Студия'],
        ['vivid', isKk() ? 'Ашық' : 'Яркий'],
        ['warm', isKk() ? 'Жылы' : 'Тёплый'],
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
    }

    if (toolId === 'style') {
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
        }, tplInfo?.accent || tplInfo?.background));
      });
      flyoutEl.append(tplGrid);

      const extraRow = document.createElement('div');
      extraRow.className = 'ft-grid-2';
      const safeOn = $('safe-zone-toggle')?.getAttribute('aria-pressed') === 'true';
      const frameVal = $('design-frame')?.value || 'template';
      extraRow.append(
        makePill(isKk() ? 'Қауіпсіз аймақ' : 'Безопасные зоны', safeOn, () => { clickNative('safe-zone-toggle'); renderFlyout('style'); }),
        makePill(isKk() ? 'Жиек' : 'Рамка фото', frameVal === 'line' || frameVal === 'mat', () => {
          const next = frameVal === 'line' ? 'mat' : frameVal === 'mat' ? 'none' : 'line';
          setNativeInput('design-frame', next);
          renderFlyout('style');
        })
      );
      flyoutEl.append(extraRow);
    }
  }

  function openFlyout(toolId) {
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

  // ---- Button states & native observer sync ----
  function syncButtonStates() {
    const cropOn = $('crop-photo')?.getAttribute('aria-pressed') === 'true';
    const focusOn = $('canvas-focus-mode')?.getAttribute('aria-pressed') === 'true';
    slotButtons.forEach((btn, id) => {
      let pressed = false;
      if (id === 'crop') pressed = openFlyoutId === 'crop' || (cropOn && !openFlyoutId);
      else if (id === 'focus') pressed = focusOn;
      else if (id === 'undo' || id === 'redo') pressed = false;
      else pressed = openFlyoutId === id;
      btn.setAttribute('aria-pressed', String(pressed));
      btn.classList.toggle('is-active', activeTool === id);
      btn.setAttribute('aria-label', t(id));
    });

    const undoBtn = slotButtons.get('undo');
    const redoBtn = slotButtons.get('redo');
    if (undoBtn && $('undo-button')) undoBtn.disabled = $('undo-button').disabled;
    if (redoBtn && $('redo-button')) redoBtn.disabled = $('redo-button').disabled;
  }

  // Wire each tool button
  slotButtons.forEach((btn, id) => {
    let pressTimer = 0;
    let longPressed = false;
    const toolMeta = TOOLS.find(x => x.id === id);

    btn.addEventListener('pointerenter', () => showTip(btn, t(id), toolMeta?.key));
    btn.addEventListener('pointerleave', () => { clearTimeout(pressTimer); hideTip(); });
    btn.addEventListener('blur', hideTip);
    btn.addEventListener('focus', () => {
      if (btn.matches(':focus-visible')) showTip(btn, t(id), toolMeta?.key);
    });

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
  });

  grip.addEventListener('pointerenter', () => showTip(grip, t('drag'), ''));
  grip.addEventListener('pointerleave', hideTip);
  grip.addEventListener('blur', hideTip);

  // Roving focus along dock
  dock.addEventListener('keydown', ev => {
    const items = [...dock.querySelectorAll('[data-ft-item]:not(:disabled)')];
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

  // Close flyout / upsell on outside press
  document.addEventListener('pointerdown', ev => {
    if (openFlyoutId && !flyoutEl.contains(ev.target) && !wrap.contains(ev.target)) {
      closeFlyout();
    }
    if (!upsellBox.hidden && !upsellBox.contains(ev.target) && !toggleBtn.contains(ev.target)) {
      upsellBox.hidden = true;
    }
  });

  // Scoped single-key shortcuts (only when unlocked & visible, never while typing!)
  stage.addEventListener('pointerenter', ev => { hoverInStage = ev.pointerType !== 'touch'; });
  stage.addEventListener('pointerleave', () => { hoverInStage = false; });

  window.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') {
      if (openFlyoutId) { closeFlyout(); return; }
      if (!upsellBox.hidden) { upsellBox.hidden = true; return; }
    }
    if (!unlocked || !enabledByUser || wrap.hidden) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.repeat || ev.defaultPrevented || isTyping(ev)) return;
    const focused = document.activeElement;
    const idle = !focused || focused === document.body;
    const inside = stage.contains(focused) || (hoverInStage && idle);
    if (!inside) return;

    const k = ev.key.toLowerCase();
    if (k === 'v') { ev.preventDefault(); slotButtons.get('crop')?.click(); }
    else if (k === 'p') { ev.preventDefault(); openFlyout('colors'); }
    else if (k === 't') { ev.preventDefault(); openFlyout('text'); }
    else if (k === 'i') { ev.preventDefault(); openFlyout('photo'); }
    else if (k === 'f') { ev.preventDefault(); openFlyout('style'); }
    else if (k === 'h') { ev.preventDefault(); slotButtons.get('focus')?.click(); }
  });

  // Keep Undo/Redo & Crop/Focus states synced with editor.js
  for (const id of ['undo-button', 'redo-button', 'crop-photo', 'canvas-focus-mode']) {
    const el = $(id);
    if (!el) continue;
    new MutationObserver(() => syncButtonStates()).observe(el, {
      attributes: true,
      attributeFilter: ['disabled', 'aria-pressed']
    });
  }

  new ResizeObserver(() => {
    if (!dragging && !wrap.hidden) settleDock(null);
  }).observe(stage);

  // ---- Header Toggle & Entitlement Logic (Server-Truthful via /api/billing) ----
  function updateVisibility() {
    const visible = unlocked && enabledByUser;
    wrap.hidden = !visible;
    toggleBtn.classList.toggle('is-unlocked', unlocked);
    toggleBtn.setAttribute('aria-pressed', String(visible));
    if (visible) {
      upsellBox.hidden = true;
      syncButtonStates();
      requestAnimationFrame(() => settleDock(null));
    } else {
      closeFlyout();
      hideTip();
    }
  }

  toggleBtn.addEventListener('click', () => {
    if (!unlocked) {
      upsellBox.hidden = !upsellBox.hidden;
      return;
    }
    enabledByUser = !enabledByUser;
    try { localStorage.setItem(STORAGE_ENABLED, enabledByUser ? '1' : '0'); } catch (_) {}
    updateVisibility();
  });

  upsellBox.querySelector('.ft-upsell-close')?.addEventListener('click', () => {
    upsellBox.hidden = true;
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

  // Expose read-only state for verification & diagnostics
  window.__SATUCARD_FAST_TOOLBAR = {
    getState: () => ({
      unlocked,
      enabledByUser,
      visible: !wrap.hidden,
      edge,
      vertical: wrap.classList.contains('is-vertical'),
      activeTool,
      openFlyoutId,
      planName,
      activeTickers: tickers.size
    }),
    dockTo: next => { if (unlocked && !wrap.hidden) dockTo(next, { x: 0, y: 0 }); },
    recheck: checkEntitlement
  };

  // Boot after DOM & editor are initialized
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { updateVisibility(); checkEntitlement(); }, { once: true });
  } else {
    updateVisibility();
    checkEntitlement();
  }
})();
