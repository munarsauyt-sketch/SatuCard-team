'use strict';

// SatuCard Motion Kit — Cross-page vanilla spring-physics engine (0% idle CPU/GPU)
// Page-distributed micro-interactions:
//   index.html    -> Rubber dock, Fan cards (zero idle interval)
//   pricing.html  -> Plan switch spotlight + synced cards, Rubber dock
//   examples.html -> Command button (24 templates), Rubber dock filters
//   editor.html   -> Morph tooltip, Rubber dock, File drop, Springy inputs,
//                    Jelly slider (#photo-zoom), Hold to publish (#download-button),
//                    Detent dial (#photo-rotation), Exposure sliders (brightness/contrast),
//                    Scrubbers (saturation/warmth/blur/radius), Copy & Undo pulse
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isReduced = () => reduceMotion.matches;
  const isKk = () => document.documentElement.lang === 'kk';
  const mountedComponents = [];

  function makeSpring(val = 0, stiffness = 320, damping = 24, mass = 1, eps = 0.002) {
    return { x: val, v: 0, target: val, k: stiffness, d: damping, m: mass, eps };
  }

  function stepSpring(s, dt) {
    if (isReduced()) {
      s.x = s.target;
      s.v = 0;
      return false;
    }
    const steps = s.k > 550 ? 3 : 2;
    const h = Math.min(0.032, dt) / steps;
    for (let i = 0; i < steps; i++) {
      const a = (-s.k * (s.x - s.target) - s.d * s.v) / s.m;
      s.v += a * h;
      s.x += s.v * h;
    }
    const tol = s.eps || 0.002;
    if (Math.abs(s.x - s.target) < tol && Math.abs(s.v) < tol * 8) {
      s.x = s.target;
      s.v = 0;
      return false;
    }
    return true;
  }

  // Shared RAF loop — sleeps completely (0% CPU/GPU) when no spring is moving
  const tickers = new Set();
  let rafId = 0;
  let lastT = 0;

  function scheduleTick() {
    if (rafId || tickers.size === 0) return;
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function loop(now) {
    rafId = 0;
    const dt = Math.max(0.004, Math.min(0.05, (now - lastT) / 1000));
    lastT = now;
    for (const fn of [...tickers]) {
      const active = fn(dt, now);
      if (!active) tickers.delete(fn);
    }
    if (tickers.size > 0) rafId = requestAnimationFrame(loop);
  }

  function wake(fn) {
    tickers.add(fn);
    scheduleTick();
  }

  function dispatchRange(input, value, fireChange = false) {
    const next = String(value);
    if (input.value !== next) {
      input.value = next;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (fireChange) {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function watchRangeSync(input, outputId, syncFn) {
    const run = () => syncFn(Number(input.value));
    input.addEventListener('input', run);
    input.addEventListener('change', run);
    const out = document.getElementById(outputId);
    if (out) {
      const mo = new MutationObserver(() => requestAnimationFrame(run));
      mo.observe(out, { childList: true, characterData: true, subtree: true });
    }
  }

  // =========================================================================
  // 1. RUBBER DOCK — Dual-edge elastic pill highlight (lead 640/38 vs trail 150/16)
  // =========================================================================
  function attachRubberDock(container, itemSelector, activeCheck, { lead = [640, 38], trail = [150, 16], followHover = false } = {}) {
    if (!container) return null;
    container.classList.add('mk-rubber-host');
    const pill = document.createElement('span');
    pill.className = 'mk-rubber-pill';
    pill.setAttribute('aria-hidden', 'true');
    container.prepend(pill);

    const sLeft = makeSpring(0, lead[0], lead[1], 1, 0.08);
    const sRight = makeSpring(0, trail[0], trail[1], 1, 0.08);
    const sTop = makeSpring(0, 420, 30, 1, 0.08);
    const sHeight = makeSpring(0, 420, 30, 1, 0.08);
    let initialized = false;
    let currentEl = null;

    function measure(el) {
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      if (!eRect.width || !eRect.height) return null;
      return {
        left: eRect.left - cRect.left,
        right: eRect.right - cRect.left,
        top: eRect.top - cRect.top,
        height: eRect.height
      };
    }

    const tick = dt => {
      const a = stepSpring(sLeft, dt);
      const b = stepSpring(sRight, dt);
      const c = stepSpring(sTop, dt);
      const d = stepSpring(sHeight, dt);
      const x0 = Math.min(sLeft.x, sRight.x);
      const w = Math.max(8, Math.abs(sRight.x - sLeft.x));
      pill.style.transform = `translate3d(${x0.toFixed(2)}px, ${sTop.x.toFixed(2)}px, 0)`;
      pill.style.width = `${w.toFixed(2)}px`;
      pill.style.height = `${sHeight.x.toFixed(2)}px`;
      return a || b || c || d;
    };

    function moveTo(el, instant = false) {
      if (!el) return;
      const m = measure(el);
      if (!m) return;
      const movingRight = initialized && m.left > sLeft.target;
      if (movingRight) {
        sRight.k = lead[0]; sRight.d = lead[1];
        sLeft.k = trail[0]; sLeft.d = trail[1];
      } else {
        sLeft.k = lead[0]; sLeft.d = lead[1];
        sRight.k = trail[0]; sRight.d = trail[1];
      }
      sLeft.target = m.left;
      sRight.target = m.right;
      sTop.target = m.top;
      sHeight.target = m.height;
      if (!initialized || instant || isReduced()) {
        sLeft.x = m.left; sLeft.v = 0;
        sRight.x = m.right; sRight.v = 0;
        sTop.x = m.top; sTop.v = 0;
        sHeight.x = m.height; sHeight.v = 0;
        initialized = true;
        pill.style.opacity = '1';
        container.classList.add('mk-rubber-ready');
      }
      currentEl = el;
      wake(tick);
    }

    function syncActive(instant = false) {
      const items = [...container.querySelectorAll(itemSelector)];
      const active = items.find(activeCheck) || items[0];
      if (active) moveTo(active, instant);
    }

    container.addEventListener('click', ev => {
      const item = ev.target.closest(itemSelector);
      if (item && container.contains(item)) {
        requestAnimationFrame(() => syncActive(false));
      }
    });

    if (followHover) {
      container.addEventListener('pointerover', ev => {
        const item = ev.target.closest(itemSelector);
        if (item && container.contains(item)) moveTo(item, false);
      });
      container.addEventListener('pointerleave', () => syncActive(false));
    }

    const mo = new MutationObserver(() => syncActive(false));
    mo.observe(container, {
      attributes: true,
      subtree: true,
      attributeFilter: ['aria-pressed', 'aria-checked', 'aria-selected', 'aria-current', 'hidden']
    });

    const ro = new ResizeObserver(() => {
      if (currentEl) moveTo(currentEl, true);
      else syncActive(true);
    });
    ro.observe(container);
    document.fonts?.ready.then(() => syncActive(true));
    requestAnimationFrame(() => syncActive(true));

    return { syncActive, moveTo };
  }

  function initRubberDocks() {
    let count = 0;
    const add = (el, sel, check, opts) => {
      if (!el) return;
      attachRubberDock(el, sel, check, opts);
      count += 1;
    };
    add(document.getElementById('main-nav'), 'a', el => el.getAttribute('aria-current') === 'page', { followHover: true });
    add(document.querySelector('.hero-style-bar'), 'button[data-cover-style]', el => el.getAttribute('aria-pressed') === 'true');
    add(document.querySelector('.quick-styles'), 'button[data-hero-style]', el => el.getAttribute('aria-pressed') === 'true');
    add(document.querySelector('.gallery-filters'), 'button[data-template-filter]', el => el.getAttribute('aria-pressed') === 'true');
    add(document.querySelector('.studio-tabs'), 'button[data-editor-tab]', el => el.getAttribute('aria-selected') === 'true');
    add(document.querySelector('.studio-filters'), 'button[data-photo-filter]', el => el.getAttribute('aria-pressed') === 'true');
    add(document.querySelector('.format-pills'), 'button[data-format-pill]', el => el.getAttribute('aria-pressed') === 'true');
    if (count) mountedComponents.push('rubber-dock');
  }

  // =========================================================================
  // 2. MORPH TOOLTIP — Shared elastic tooltip + spring tail (Editor rail & toolbar)
  // =========================================================================
  function initMorphTooltip() {
    const items = [...document.querySelectorAll('[data-morph-tip]')];
    if (!items.length || window.matchMedia('(hover: none)').matches) return;
    mountedComponents.push('morph-tooltip');

    const tip = document.createElement('div');
    tip.className = 'mk-morph-tooltip';
    tip.setAttribute('aria-hidden', 'true');
    const clip = document.createElement('div');
    clip.className = 'mk-morph-tooltip-clip';
    const labelA = document.createElement('span');
    labelA.className = 'mk-morph-tooltip-label';
    const labelB = document.createElement('span');
    labelB.className = 'mk-morph-tooltip-label';
    labelB.style.opacity = '0';
    clip.append(labelA, labelB);
    const tail = document.createElement('span');
    tail.className = 'mk-morph-tooltip-tail';
    tip.append(clip, tail);
    document.body.append(tip);

    const measurer = document.createElement('span');
    measurer.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;white-space:nowrap;font:600 12px/16px var(--ui-font,Manrope,sans-serif);padding:0 12px;';
    document.body.append(measurer);

    const sLeft = makeSpring(0, 620, 36, 1, 0.08);
    const sRight = makeSpring(0, 190, 19, 1, 0.08);
    const sTop = makeSpring(0, 420, 28, 1, 0.08);
    const sTail = makeSpring(0, 300, 22, 1, 0.08);
    const sShow = makeSpring(0, 420, 24);
    const sSlide = makeSpring(1, 420, 32);

    let activeEl = null;
    let activeText = '';
    let prevText = '';
    let slideDir = 1;
    let isBelow = false;
    let hideTimer = 0;

    function getTipText(el) {
      return (isKk() && el.dataset.morphTipKk) || el.dataset.morphTip || '';
    }

    const tick = dt => {
      const a = stepSpring(sLeft, dt);
      const b = stepSpring(sRight, dt);
      const c = stepSpring(sTop, dt);
      const d = stepSpring(sTail, dt);
      const e = stepSpring(sShow, dt);
      const f = stepSpring(sSlide, dt);

      const x0 = Math.min(sLeft.x, sRight.x);
      const w = Math.max(44, Math.abs(sRight.x - sLeft.x));
      const scale = 0.88 + 0.12 * sShow.x;
      const yLift = (1 - sShow.x) * (isBelow ? -6 : 6);
      tip.style.transform = `translate3d(${x0.toFixed(2)}px, ${(sTop.x + yLift).toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
      tip.style.width = `${w.toFixed(2)}px`;
      tip.style.opacity = Math.max(0, Math.min(1, sShow.x)).toFixed(3);

      const tailRel = Math.max(12, Math.min(w - 12, sTail.x - x0));
      tail.style.transform = `translate3d(${(tailRel - 4).toFixed(2)}px, 0, 0) rotate(45deg)`;

      const p = Math.max(0, Math.min(1, sSlide.x));
      labelA.style.transform = `translate3d(${((1 - p) * 14 * slideDir).toFixed(2)}px, 0, 0)`;
      labelA.style.opacity = p.toFixed(3);
      labelB.style.transform = `translate3d(${(-p * 14 * slideDir).toFixed(2)}px, 0, 0)`;
      labelB.style.opacity = (prevText ? (1 - p) : 0).toFixed(3);

      return a || b || c || d || e || f;
    };

    function showFor(el) {
      clearTimeout(hideTimer);
      const text = getTipText(el);
      if (!text) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width) return;
      measurer.textContent = text;
      const w = Math.ceil(measurer.getBoundingClientRect().width) + 4;
      const cx = rect.left + rect.width / 2;
      const clampedLeft = Math.max(10, Math.min(window.innerWidth - w - 10, cx - w / 2));
      const targetLeft = clampedLeft;
      const targetRight = clampedLeft + w;
      const placeBelow = rect.top < 64;
      isBelow = placeBelow;
      tip.classList.toggle('is-below', placeBelow);
      const targetTop = placeBelow ? Math.min(window.innerHeight - 40, rect.bottom + 10) : rect.top - 42;

      const wasVisible = sShow.x > 0.08 && activeEl !== null;
      if (wasVisible && activeEl !== el) {
        const movingRight = cx > sTail.target;
        slideDir = movingRight ? 1 : -1;
        if (movingRight) {
          sRight.k = 620; sRight.d = 36;
          sLeft.k = 190; sLeft.d = 19;
        } else {
          sLeft.k = 620; sLeft.d = 36;
          sRight.k = 190; sRight.d = 19;
        }
        prevText = activeText;
        labelB.textContent = prevText;
        labelA.textContent = text;
        sSlide.x = 0; sSlide.v = 0; sSlide.target = 1;
      } else {
        prevText = '';
        labelB.textContent = '';
        labelA.textContent = text;
        sLeft.x = targetLeft; sLeft.v = 0;
        sRight.x = targetRight; sRight.v = 0;
        sTop.x = targetTop; sTop.v = 0;
        sTail.x = cx; sTail.v = 0;
        sSlide.x = 1; sSlide.v = 0; sSlide.target = 1;
      }

      activeEl = el;
      activeText = text;
      sLeft.target = targetLeft;
      sRight.target = targetRight;
      sTop.target = targetTop;
      sTail.target = cx;
      sShow.target = 1;
      wake(tick);
    }

    function hide() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        activeEl = null;
        sShow.target = 0;
        wake(tick);
      }, 65);
    }

    items.forEach(el => {
      // Prevent duplicate native browser title tooltip while keeping aria-label intact
      if (el.hasAttribute('title')) el.removeAttribute('title');
      el.addEventListener('pointerenter', () => showFor(el));
      el.addEventListener('focus', () => showFor(el));
      el.addEventListener('pointerleave', hide);
      el.addEventListener('blur', hide);
    });
    window.addEventListener('scroll', () => { if (activeEl) hide(); }, { passive: true });
  }

  // =========================================================================
  // 3. COMMAND BUTTON — Expandable 24-template quick search (examples.html)
  // =========================================================================
  function initCommandButton() {
    const wrap = document.getElementById('template-cmd');
    const shell = wrap?.querySelector('.mk-cmd-shell');
    const trigger = document.getElementById('template-cmd-trigger');
    const inputRow = wrap?.querySelector('.mk-cmd-input-row');
    const input = document.getElementById('template-cmd-input');
    const escBtn = wrap?.querySelector('.mk-cmd-esc');
    const dropdown = document.getElementById('template-cmd-dropdown');
    const renderer = window.SATUCARD_RENDERER;
    const mapSamples = window.SATUCARD_TEMPLATE_SAMPLES || {};
    if (!wrap || !shell || !trigger || !inputRow || !input || !dropdown || !renderer) return;
    mountedComponents.push('command-button');

    const demoSelect = document.getElementById('demo-product');
    const entries = Object.entries(renderer.templates).map(([key, tpl]) => ({
      key,
      label: tpl.label || key,
      description: tpl.description || '',
      background: tpl.background || '#f2efe9',
      accent: tpl.accent || '#ea784e',
      photo: mapSamples[key] || 'perfume'
    }));

    const CLOSED_W = 186;
    const sWidth = makeSpring(CLOSED_W, 340, 28, 1, 0.12);
    const sPress = makeSpring(1, 520, 34, 0.6);
    let isOpen = false;
    let activeIdx = 0;
    let filtered = entries;

    const tick = dt => {
      const a = stepSpring(sWidth, dt);
      const b = stepSpring(sPress, dt);
      shell.style.width = `${sWidth.x.toFixed(1)}px`;
      shell.style.transform = `scale(${sPress.x.toFixed(4)})`;
      return a || b;
    };
    shell.style.width = `${CLOSED_W}px`;

    function templateHref(item) {
      const chosenProduct = demoSelect && demoSelect.value !== 'mixed' ? demoSelect.value : item.photo;
      return `editor.html?style=${encodeURIComponent(item.key)}&photo=${encodeURIComponent(chosenProduct)}`;
    }

    function renderResults(query = '') {
      const q = query.trim().toLowerCase();
      filtered = q
        ? entries.filter(e => e.label.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.key.includes(q))
        : entries;
      activeIdx = Math.min(activeIdx, Math.max(0, filtered.length - 1));
      dropdown.innerHTML = '';
      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'mk-cmd-empty';
        empty.textContent = isKk() ? 'Үлгі табылмады' : 'Шаблон не найден';
        dropdown.append(empty);
        return;
      }
      filtered.slice(0, 12).forEach((item, idx) => {
        const a = document.createElement('a');
        a.className = 'mk-cmd-item' + (idx === activeIdx ? ' is-active' : '');
        a.href = templateHref(item);
        a.setAttribute('role', 'option');
        a.setAttribute('aria-selected', String(idx === activeIdx));
        a.innerHTML = `
          <span class="mk-cmd-item-main">
            <span class="mk-cmd-swatch" style="background:${item.background};--sw-accent:${item.accent}"></span>
            <span class="mk-cmd-item-text"><strong>${item.label}</strong><small>${item.description}</small></span>
          </span>
          <span aria-hidden="true">↗</span>`;
        dropdown.append(a);
      });
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      shell.classList.add('is-open');
      trigger.hidden = true;
      inputRow.hidden = false;
      dropdown.hidden = false;
      sWidth.target = Math.min(306, Math.max(236, window.innerWidth - 40));
      sPress.v = -1.2;
      wake(tick);
      renderResults(input.value);
      requestAnimationFrame(() => input.focus());
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      shell.classList.remove('is-open');
      input.value = '';
      inputRow.hidden = true;
      dropdown.hidden = true;
      trigger.hidden = false;
      sWidth.target = CLOSED_W;
      wake(tick);
    }

    trigger.addEventListener('pointerdown', () => { sPress.target = 0.96; wake(tick); });
    window.addEventListener('pointerup', () => { if (sPress.target !== 1) { sPress.target = 1; wake(tick); } });
    trigger.addEventListener('click', open);
    escBtn?.addEventListener('click', close);

    input.addEventListener('input', () => { activeIdx = 0; renderResults(input.value); });
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); close(); trigger.focus(); return; }
      const maxVisible = Math.max(1, Math.min(12, filtered.length));
      if (ev.key === 'ArrowDown') { ev.preventDefault(); activeIdx = (activeIdx + 1) % maxVisible; renderResults(input.value); return; }
      if (ev.key === 'ArrowUp') { ev.preventDefault(); activeIdx = (activeIdx - 1 + maxVisible) % maxVisible; renderResults(input.value); return; }
      if (ev.key === 'Enter' && filtered[activeIdx]) {
        ev.preventDefault();
        location.assign(templateHref(filtered[activeIdx]));
      }
    });

    document.addEventListener('pointerdown', ev => {
      if (isOpen && !wrap.contains(ev.target)) close();
    });

    document.addEventListener('keydown', ev => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        if (isOpen) close();
        else open();
      }
    });
  }

  // =========================================================================
  // 4. FAN CARDS — 3 real SATUCARD_RENDERER cards (index.html, 0% idle CPU)
  // =========================================================================
  function initFanCards() {
    const stage = document.getElementById('fan-deck');
    const renderer = window.SATUCARD_RENDERER;
    const samples = window.SATUCARD_SAMPLES || {};
    if (!stage || !renderer) return;
    const cards = [...stage.querySelectorAll('.mk-fan-card')];
    if (cards.length < 3) return;
    mountedComponents.push('fan-cards');

    // Render each card once using the real SatuCard canvas renderer
    cards.forEach(card => {
      const tpl = card.dataset.fanTemplate || 'studio';
      const photoKey = card.dataset.fanPhoto || 'perfume';
      const canvas = card.querySelector('canvas');
      if (!canvas) return;
      const sample = samples[photoKey] || {
        title: 'Парфюм Atelier 100 мл',
        subtitle: 'Амбра, кедр и тёплые специи',
        price: 21500,
        badge: 'Лимитировано',
        features: ['Флакон из янтарного стекла', 'Стойкий аромат', 'Крышка из дерева']
      };
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const state = renderer.normalize({
          ...sample,
          template: tpl,
          format: 'portrait',
          font: 'manrope',
          showBrand: false
        });
        renderer.render(canvas, state, { photo: img }, { scale: 0.72 });
      };
      img.src = `assets/images/${photoKey}.jpg`;
    });

    // Resting fanned spread = 0.78 (NO idle setInterval!)
    const BASE_SPREAD = 0.78;
    const HOVER_SPREAD = 1.08;
    const sSpread = makeSpring(BASE_SPREAD, 210, 20);
    const lifts = cards.map(() => makeSpring(0, 320, 24));
    let hoveredIdx = -1;

    function layoutSpreadPx() {
      const w = stage.clientWidth || 360;
      return w < 380 ? 52 : w < 520 ? 74 : 96;
    }

    function applyTransforms() {
      const s = sSpread.x;
      const dx = layoutSpreadPx();
      const poses = [
        { x: -dx * s, y: 12 * s, r: -11 * s, z: 1 },
        { x: 0,       y: -6 * s, r: 0,       z: 3 },
        { x: dx * s,  y: 12 * s, r: 11 * s,  z: 2 }
      ];
      cards.forEach((card, i) => {
        const p = poses[i];
        const lift = lifts[i].x;
        const sc = 1 + lift * 0.048;
        card.style.zIndex = String(i === hoveredIdx ? 6 : p.z);
        card.style.transform = `translate3d(${p.x.toFixed(1)}px, ${(p.y - lift * 18).toFixed(1)}px, 0) rotate(${(p.r * (1 - lift * 0.35)).toFixed(2)}deg) scale(${sc.toFixed(4)})`;
      });
    }

    const tick = dt => {
      let active = stepSpring(sSpread, dt);
      lifts.forEach(sp => { if (stepSpring(sp, dt)) active = true; });
      applyTransforms();
      return active;
    };

    stage.addEventListener('pointerenter', () => {
      sSpread.target = HOVER_SPREAD;
      wake(tick);
    });
    stage.addEventListener('pointerleave', () => {
      hoveredIdx = -1;
      sSpread.target = BASE_SPREAD;
      lifts.forEach(sp => { sp.target = 0; });
      wake(tick);
    });
    cards.forEach((card, i) => {
      const enter = () => {
        hoveredIdx = i;
        sSpread.target = HOVER_SPREAD;
        lifts.forEach((sp, j) => { sp.target = j === i ? 1 : 0; });
        wake(tick);
      };
      const leave = () => {
        if (hoveredIdx === i) hoveredIdx = -1;
        lifts[i].target = 0;
        wake(tick);
      };
      card.addEventListener('pointerenter', enter);
      card.addEventListener('focus', enter);
      card.addEventListener('pointerleave', leave);
      card.addEventListener('blur', leave);
    });

    const ro = new ResizeObserver(() => applyTransforms());
    ro.observe(stage);
    applyTransforms();
  }

  // =========================================================================
  // 5. PLAN SWITCH — Stretchy switch + drum-rolling KZT digits (pricing.html)
  // =========================================================================
  function initPlanSwitch() {
    const switcher = document.getElementById('sai-plan-switch');
    const drum = document.getElementById('sai-price-drum');
    const badge = document.getElementById('sai-token-badge');
    const caption = document.getElementById('sai-plan-caption');
    const bonusRow = document.getElementById('sai-bonus-row');
    const bonusText = document.getElementById('sai-bonus-text');
    const bonusCheck = bonusRow?.querySelector('.mk-plan-bonus-check');
    const cta = document.getElementById('sai-plan-cta');
    if (!switcher || !drum || !badge || !caption || !bonusRow || !bonusText || !cta) return;
    mountedComponents.push('plan-switch');

    const PLANS = {
      basic: {
        price: '1 500',
        tokensRu: '5 млн токенов',
        tokensKk: '5 млн токен',
        captionRu: 'Базовые модели sAI для текстов и перевода RU / KZ на 30 дней.',
        captionKk: 'Мәтін мен RU / KZ аудармасына арналған 30 күндік негізгі sAI модельдері.',
        bonusRu: '',
        bonusKk: ''
      },
      plus: {
        price: '2 990',
        tokensRu: '8 млн токенов',
        tokensKk: '8 млн токен',
        captionRu: 'Больше лимитов и моделей для сложных правок на 30 дней.',
        captionKk: 'Күрделі түзетулерге арналған көбірек лимит пен модельдер (30 күн).',
        bonusRu: 'Включает «ИИ Старт» + увеличенный лимит токенов sAI',
        bonusKk: '«ЖИ Старт» + ұлғайтылған sAI токен лимиті кіреді'
      },
      max: {
        price: '4 990',
        tokensRu: '10 млн токенов',
        tokensKk: '10 млн токен',
        captionRu: 'Полный выбор старших моделей sAI на 30 дней.',
        captionKk: '30 күнге жоғарғы sAI модельдерінің толық таңдауы.',
        bonusRu: 'Полный выбор старших моделей sAI (GPT-6 Astra, GPT-6.1 Sol, Claude Opus 5.5)',
        bonusKk: 'Жоғарғы sAI модельдерінің толық таңдауы (GPT-6 Astra, GPT-6.1 Sol, Claude Opus 5.5)'
      },
      max3: {
        price: '9 990',
        tokensRu: '30 млн токенов',
        tokensKk: '30 млн токен',
        captionRu: 'Тройной лимит sAI для одного аккаунта — 30 млн токенов.',
        captionKk: 'Бір аккаунтқа үш еселенген sAI лимиті — 30 млн токен.',
        bonusRu: 'Личный лимит sAI ×3 — 30 млн токенов и все старшие модели',
        bonusKk: 'Жеке sAI ×3 лимиті — 30 млн токен және барлық жоғарғы модельдер'
      }
    };

    const dock = attachRubberDock(
      switcher,
      'button[data-sai-plan]',
      el => el.getAttribute('aria-checked') === 'true',
      { lead: [520, 32], trail: [165, 18] }
    );

    const buttons = [...switcher.querySelectorAll('button[data-sai-plan]')];
    const sBonus = makeSpring(1, 240, 22);
    const sBadgePop = makeSpring(1, 460, 20);
    const sCheckPop = makeSpring(1, 440, 18);
    let currentKey = 'max';

    // Build vertical 0..9 digit strips once for smooth odometer drum roll
    function buildDrum(initialPrice) {
      drum.innerHTML = '';
      const chars = [...initialPrice];
      chars.forEach(ch => {
        if (ch === ' ') {
          const sep = document.createElement('span');
          sep.className = 'mk-digit-sep';
          sep.textContent = '\u00a0';
          drum.append(sep);
        } else {
          const col = document.createElement('span');
          col.className = 'mk-digit-col';
          const strip = document.createElement('span');
          strip.className = 'mk-digit-strip';
          for (let d = 0; d <= 9; d++) {
            const span = document.createElement('span');
            span.textContent = String(d);
            strip.append(span);
          }
          strip.style.transform = `translate3d(0, ${-Number(ch) * 1.08}em, 0)`;
          col.append(strip);
          drum.append(col);
        }
      });
      const cur = document.createElement('span');
      cur.className = 'mk-digit-sep';
      cur.textContent = '\u00a0';
      const tenge = document.createElement('span');
      tenge.textContent = '₸';
      drum.append(cur, tenge);
    }

    function rollDrum(priceStr) {
      const digits = priceStr.replace(/\s+/g, '').split('').map(Number);
      const strips = [...drum.querySelectorAll('.mk-digit-strip')];
      if (strips.length !== digits.length) {
        buildDrum(priceStr);
        return;
      }
      strips.forEach((strip, idx) => {
        strip.style.transform = `translate3d(0, ${-digits[idx] * 1.08}em, 0)`;
      });
    }

    const tick = dt => {
      const a = stepSpring(sBonus, dt);
      const b = stepSpring(sBadgePop, dt);
      const c = stepSpring(sCheckPop, dt);
      const innerH = bonusRow.firstElementChild?.scrollHeight || 28;
      const p = Math.max(0, Math.min(1, sBonus.x));
      bonusRow.style.height = `${(innerH * p).toFixed(1)}px`;
      bonusRow.style.opacity = p.toFixed(3);
      badge.style.transform = `scale(${sBadgePop.x.toFixed(4)})`;
      if (bonusCheck) bonusCheck.style.transform = `scale(${sCheckPop.x.toFixed(4)})`;
      return a || b || c;
    };

    function planHref(key) {
      const url = new URL('dashboard.html#billing-title', location.href);
      url.searchParams.set('plan', key);
      const theme = document.documentElement.dataset.theme;
      if (theme) url.searchParams.set('theme', theme);
      return url.href;
    }

    function syncCardHighlight(key) {
      const cards = document.querySelectorAll('#pricing-plans .pricing-card[data-plan]');
      cards.forEach(card => {
        card.classList.toggle('mk-plan-highlighted', card.dataset.plan === key);
      });
    }

    function selectPlan(key, animate = true) {
      const data = PLANS[key];
      if (!data) return;
      currentKey = key;
      buttons.forEach(btn => btn.setAttribute('aria-checked', String(btn.dataset.saiPlan === key)));
      rollDrum(data.price);
      const kk = isKk();
      badge.textContent = kk ? data.tokensKk : data.tokensRu;
      caption.textContent = kk ? data.captionKk : data.captionRu;
      const bonus = kk ? data.bonusKk : data.bonusRu;
      if (bonus) {
        bonusText.textContent = bonus;
        sBonus.target = 1;
      } else {
        sBonus.target = 0;
      }
      cta.href = planHref(key);
      syncCardHighlight(key);

      if (animate) {
        sBadgePop.x = 0.86; sBadgePop.v = 3.2; sBadgePop.target = 1;
        if (bonus) { sCheckPop.x = 0.45; sCheckPop.v = 5.4; sCheckPop.target = 1; }
      } else {
        sBonus.x = sBonus.target;
        sBadgePop.x = 1;
        sCheckPop.x = 1;
      }
      dock?.syncActive(!animate);
      wake(tick);
    }

    buildDrum(PLANS[currentKey].price);
    selectPlan(currentKey, false);

    buttons.forEach(btn => {
      btn.addEventListener('click', () => selectPlan(btn.dataset.saiPlan, true));
    });
    cta.addEventListener('click', () => { cta.href = planHref(currentKey); });

    // Sync with cards rendered asynchronously by ES module pricing.js
    const plansGrid = document.getElementById('pricing-plans');
    if (plansGrid) {
      const gridMo = new MutationObserver(() => syncCardHighlight(currentKey));
      gridMo.observe(plansGrid, { childList: true });
      plansGrid.addEventListener('pointerenter', ev => {
        const card = ev.target.closest?.('.pricing-card[data-plan]');
        if (card?.dataset.plan && card.dataset.plan !== currentKey) {
          // Only highlight passively on click so we don't jump the switch under cursor
        }
      }, true);
      plansGrid.addEventListener('click', ev => {
        if (ev.target.closest('a, summary, details')) return;
        const card = ev.target.closest('.pricing-card[data-plan]');
        if (card?.dataset.plan) selectPlan(card.dataset.plan, true);
      });
    }

    document.addEventListener('satucard:language-change', () => selectPlan(currentKey, false));
  }

  // =========================================================================
  // 6. FILE DROP — Spring scale + floating file chip + SVG ring (Editor #drop-zone)
  // =========================================================================
  function initEditorFileDrop() {
    const zone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('photo-input');
    const symbol = zone?.querySelector('.upload-symbol');
    if (!zone || !fileInput || !symbol) return;
    mountedComponents.push('file-drop');

    zone.classList.add('mk-file-drop');
    symbol.classList.add('mk-upload-ring');

    const chip = document.createElement('span');
    chip.className = 'mk-drop-chip';
    chip.setAttribute('aria-hidden', 'true');
    chip.textContent = 'товар.jpg';
    zone.append(chip);

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'mk-upload-ring-svg');
    svg.setAttribute('viewBox', '0 0 44 44');
    svg.setAttribute('aria-hidden', 'true');
    const track = document.createElementNS(NS, 'circle');
    track.setAttribute('class', 'mk-upload-ring-track');
    track.setAttribute('cx', '22'); track.setAttribute('cy', '22'); track.setAttribute('r', '19');
    const arc = document.createElementNS(NS, 'circle');
    arc.setAttribute('class', 'mk-upload-ring-arc');
    arc.setAttribute('cx', '22'); arc.setAttribute('cy', '22'); arc.setAttribute('r', '19');
    const CIRC = 2 * Math.PI * 19;
    arc.setAttribute('stroke-dasharray', CIRC.toFixed(1));
    arc.setAttribute('stroke-dashoffset', CIRC.toFixed(1));
    svg.append(track, arc);
    symbol.append(svg);

    const sScale = makeSpring(1, 420, 26);
    const sChip = makeSpring(0, 340, 22);
    const sProg = makeSpring(0, 180, 22);
    let doneTimer = 0;

    const tick = dt => {
      const a = stepSpring(sScale, dt);
      const b = stepSpring(sChip, dt);
      const c = stepSpring(sProg, dt);
      zone.style.transform = `scale(${sScale.x.toFixed(4)})`;
      chip.style.opacity = Math.max(0, Math.min(1, sChip.x)).toFixed(3);
      chip.style.transform = `translate3d(0, ${((1 - sChip.x) * 8).toFixed(2)}px, 0) rotate(${((1 - sChip.x) * 5 - 3).toFixed(2)}deg)`;
      const p = Math.max(0, Math.min(1, sProg.x));
      arc.setAttribute('stroke-dashoffset', (CIRC * (1 - p)).toFixed(2));
      return a || b || c;
    };

    function playUploadPulse(fileName) {
      clearTimeout(doneTimer);
      chip.textContent = (fileName || 'товар.jpg').slice(0, 18);
      zone.classList.remove('is-uploaded');
      zone.classList.add('is-uploading');
      sProg.x = 0.08; sProg.v = 0; sProg.target = 1;
      sScale.v = -0.35; sScale.target = 1;
      sChip.target = 1;
      wake(tick);
      doneTimer = setTimeout(() => {
        zone.classList.remove('is-uploading');
        zone.classList.add('is-uploaded');
        doneTimer = setTimeout(() => {
          zone.classList.remove('is-uploaded');
          sChip.target = 0;
          sProg.x = 0; sProg.target = 0;
          wake(tick);
        }, 1450);
      }, 420);
    }

    zone.addEventListener('pointerenter', () => { sScale.target = 1.014; sChip.target = 1; wake(tick); });
    zone.addEventListener('pointerleave', () => { sScale.target = 1; sChip.target = 0; wake(tick); });
    zone.addEventListener('dragenter', () => { sScale.target = 1.03; sChip.target = 1; wake(tick); });
    zone.addEventListener('dragover', () => { sScale.target = 1.03; sChip.target = 1; wake(tick); });
    zone.addEventListener('dragleave', () => { sScale.target = 1; sChip.target = 0; wake(tick); });
    zone.addEventListener('drop', ev => {
      const f = ev.dataTransfer?.files?.[0];
      playUploadPulse(f?.name);
    });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      if (f) playUploadPulse(f.name);
    });
  }

  // =========================================================================
  // 7. SPRINGY INPUTS — Keystroke spring + 700/10 wave-shake on invalid price (Editor)
  // =========================================================================
  function initEditorSpringyInputs() {
    const configs = [
      { id: 'product-name', errorId: null },
      { id: 'product-price', errorId: 'price-error' },
      { id: 'old-price', errorId: 'old-price-error' }
    ];
    let mounted = false;

    configs.forEach(({ id, errorId }) => {
      const input = document.getElementById(id);
      if (!input) return;
      mounted = true;
      const field = input.closest('.studio-field') || input.parentElement;
      field?.classList.add('mk-spring-field');

      const sPop = makeSpring(1, 520, 28, 0.7);
      const sShake = makeSpring(0, 700, 10, 1, 0.08);

      const tick = dt => {
        const a = stepSpring(sPop, dt);
        const b = stepSpring(sShake, dt);
        input.style.transform = `translate3d(${sShake.x.toFixed(2)}px, 0, 0) scale(${sPop.x.toFixed(4)})`;
        return a || b;
      };

      input.addEventListener('input', () => {
        if (!isReduced()) {
          sPop.v = 0.24;
          sPop.target = 1;
          wake(tick);
        }
      });

      if (errorId) {
        const errEl = document.getElementById(errorId);
        if (errEl) {
          let lastErr = '';
          const checkErr = () => {
            const msg = errEl.textContent.trim();
            field?.classList.toggle('is-error', Boolean(msg));
            if (msg && msg !== lastErr && !isReduced()) {
              sShake.x = 0;
              sShake.v = 240;
              sShake.target = 0;
              wake(tick);
            }
            lastErr = msg;
          };
          const mo = new MutationObserver(checkErr);
          mo.observe(errEl, { childList: true, characterData: true, subtree: true });
        }
      }
    });

    if (mounted) mountedComponents.push('springy-inputs');
  }

  // =========================================================================
  // 8. JELLY SLIDER — Velocity-squashing thumb + SVG goo droplet (Editor #photo-zoom)
  // =========================================================================
  function ensureGooFilter() {
    if (document.getElementById('mk-jelly-goo')) return;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
    svg.innerHTML = `<defs><filter id="mk-jelly-goo"><feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="blur"/><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo"/><feBlend in="SourceGraphic" in2="goo"/></filter></defs>`;
    document.body.append(svg);
  }

  function initEditorJellySlider() {
    const input = document.getElementById('photo-zoom');
    const host = input?.closest('.studio-range');
    if (!input || !host) return;
    mountedComponents.push('jelly-slider');
    ensureGooFilter();

    const MIN = Number(input.min) || 70;
    const MAX = Number(input.max) || 250;
    const DEFAULT_VAL = 100;
    input.classList.add('mk-upgraded-range');

    const wrap = document.createElement('div');
    wrap.className = 'mk-jelly-wrap';
    wrap.innerHTML = `
      <div class="mk-jelly-slider" role="presentation" title="Двойной клик — 100%">
        <div class="mk-jelly-track"><div class="mk-jelly-fill"></div></div>
        <div class="mk-jelly-goo-layer">
          <div class="mk-jelly-drop"></div>
          <div class="mk-jelly-thumb"></div>
        </div>
        <div class="mk-jelly-drop-text">100%</div>
      </div>
      <div class="mk-jelly-ticks" aria-hidden="true">
        <span class="mk-jelly-tick" data-tick="70">70</span>
        <span class="mk-jelly-tick" data-tick="100">100</span>
        <span class="mk-jelly-tick" data-tick="150">150</span>
        <span class="mk-jelly-tick" data-tick="200">200</span>
        <span class="mk-jelly-tick" data-tick="250">250</span>
      </div>`;
    host.append(wrap);

    const slider = wrap.querySelector('.mk-jelly-slider');
    const fill = wrap.querySelector('.mk-jelly-fill');
    const thumb = wrap.querySelector('.mk-jelly-thumb');
    const drop = wrap.querySelector('.mk-jelly-drop');
    const dropText = wrap.querySelector('.mk-jelly-drop-text');
    const ticks = [...wrap.querySelectorAll('.mk-jelly-tick')];

    const toPct = v => Math.max(0, Math.min(1, (v - MIN) / (MAX - MIN)));
    const sPct = makeSpring(toPct(Number(input.value) || DEFAULT_VAL), 420, 26);
    const sRise = makeSpring(0, 380, 22);
    const sSquash = makeSpring(0, 360, 18);
    let dragging = false;

    function updateTicks(val) {
      ticks.forEach(t => t.classList.toggle('is-lit', Number(t.dataset.tick) <= val + 2));
    }

    function paint() {
      const p = Math.max(0, Math.min(1, sPct.x));
      const w = slider.clientWidth || 220;
      const xPx = p * w;
      const rise = Math.max(0, Math.min(1.15, sRise.x));
      const sq = Math.max(-0.28, Math.min(0.28, sSquash.x));
      const sx = 1 + Math.abs(sq) * 0.9;
      const sy = 1 - Math.abs(sq) * 0.55;
      const val = Math.round(MIN + p * (MAX - MIN));

      fill.style.width = `${(p * 100).toFixed(2)}%`;
      thumb.style.transform = `translate3d(${xPx.toFixed(2)}px, 0, 0) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
      drop.style.transform = `translate3d(${xPx.toFixed(2)}px, ${(-38 * rise).toFixed(2)}px, 0) scale(${(0.55 + 0.45 * rise).toFixed(3)})`;
      drop.style.opacity = Math.min(1, rise * 1.15).toFixed(3);
      dropText.textContent = `${val}%`;
      dropText.style.transform = `translate3d(${xPx.toFixed(2)}px, ${(-38 * rise).toFixed(2)}px, 0) scale(${(0.65 + 0.35 * rise).toFixed(3)})`;
      dropText.style.opacity = Math.min(1, rise * 1.2).toFixed(3);
      updateTicks(val);
    }

    const tick = dt => {
      const prevX = sPct.x;
      const a = stepSpring(sPct, dt);
      const b = stepSpring(sRise, dt);
      const vel = (sPct.x - prevX) / Math.max(0.008, dt);
      sSquash.target = dragging ? Math.max(-0.25, Math.min(0.25, vel * 0.08)) : 0;
      const c = stepSpring(sSquash, dt);
      paint();
      return a || b || c;
    };

    function setFromClientX(clientX, fireChange = false) {
      const rect = slider.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      const val = Math.round(MIN + p * (MAX - MIN));
      sPct.target = p;
      dispatchRange(input, val, fireChange);
      wake(tick);
    }

    slider.addEventListener('pointerdown', ev => {
      ev.preventDefault();
      dragging = true;
      slider.setPointerCapture?.(ev.pointerId);
      sRise.target = 1;
      setFromClientX(ev.clientX, false);
    });
    slider.addEventListener('pointermove', ev => {
      if (!dragging) return;
      setFromClientX(ev.clientX, false);
    });
    const finishDrag = ev => {
      if (!dragging) return;
      dragging = false;
      slider.releasePointerCapture?.(ev.pointerId);
      sRise.target = 0;
      sSquash.target = 0;
      setFromClientX(ev.clientX, true);
    };
    slider.addEventListener('pointerup', finishDrag);
    slider.addEventListener('pointercancel', finishDrag);
    slider.addEventListener('dblclick', () => {
      sPct.target = toPct(DEFAULT_VAL);
      dispatchRange(input, DEFAULT_VAL, true);
      wake(tick);
    });

    watchRangeSync(input, 'photo-zoom-value', val => {
      if (dragging) return;
      sPct.target = toPct(val);
      wake(tick);
    });

    const ro = new ResizeObserver(() => paint());
    ro.observe(slider);
    paint();
  }

  // =========================================================================
  // 9. HOLD TO PUBLISH — Contrast sweep + early-release wobble + checkmark (Editor #download-button)
  // =========================================================================
  function initEditorHoldToPublish() {
    const btn = document.getElementById('download-button');
    if (!btn) return;
    mountedComponents.push('hold-to-publish');

    const origSpan = btn.querySelector('span');
    const origSvg = btn.querySelector('svg');
    if (!origSpan) return;

    btn.classList.add('mk-hold-btn');

    // IMPORTANT: Keep origSpan as the FIRST & ONLY <span> inside #download-button
    // so editor.js line 407 `$('download-button').querySelector('span').textContent = ...` stays 100% compatible!
    const fill = document.createElement('i');
    fill.className = 'mk-hold-fill';
    fill.setAttribute('aria-hidden', 'true');

    const baseLayer = document.createElement('i');
    baseLayer.className = 'mk-hold-layer';
    if (origSvg) baseLayer.append(origSvg);
    baseLayer.append(origSpan);

    const invLayer = document.createElement('i');
    invLayer.className = 'mk-hold-layer mk-hold-layer-inv';
    invLayer.setAttribute('aria-hidden', 'true');
    if (origSvg) invLayer.append(origSvg.cloneNode(true));
    const invText = document.createElement('b');
    invText.className = 'mk-hold-inv-text';
    invText.textContent = origSpan.textContent;
    invLayer.append(invText);

    const NS = 'http://www.w3.org/2000/svg';
    const checkSvg = document.createElementNS(NS, 'svg');
    checkSvg.setAttribute('class', 'mk-hold-check-svg');
    checkSvg.setAttribute('viewBox', '0 0 24 24');
    checkSvg.setAttribute('aria-hidden', 'true');
    checkSvg.innerHTML = '<path d="M5 13l4.5 4.5L19 7"/>';

    btn.innerHTML = '';
    btn.append(fill, baseLayer, invLayer, checkSvg);

    const syncLabel = () => { invText.textContent = origSpan.textContent; };
    const labelMo = new MutationObserver(syncLabel);
    labelMo.observe(origSpan, { childList: true, characterData: true, subtree: true });

    const HOLD_MS = 620;
    const QUICK_TAP_MS = 175;
    const sWobble = makeSpring(0, 700, 12, 1, 0.08);
    const sScale = makeSpring(1, 480, 28);
    let holding = false;
    let holdStart = 0;
    let suppressNextClick = false;
    let syntheticClick = false;
    let doneTimer = 0;

    function setSweep(p) {
      const clamped = Math.max(0, Math.min(1, p));
      const pct = (clamped * 100).toFixed(2);
      fill.style.width = `${pct}%`;
      invLayer.style.clipPath = `inset(0 ${(100 - clamped * 100).toFixed(2)}% 0 0)`;
    }

    function celebrateDone() {
      clearTimeout(doneTimer);
      setSweep(0);
      btn.classList.add('is-done');
      sScale.x = 0.94; sScale.v = 2.6; sScale.target = 1;
      wake(tick);
      doneTimer = setTimeout(() => {
        btn.classList.remove('is-done');
      }, 1500);
    }

    const tick = (dt, now) => {
      let active = stepSpring(sWobble, dt) || stepSpring(sScale, dt);
      if (holding) {
        const elapsed = now - holdStart;
        if (elapsed >= QUICK_TAP_MS) {
          const p = Math.min(1, (elapsed - QUICK_TAP_MS) / (HOLD_MS - QUICK_TAP_MS));
          setSweep(p);
          if (p >= 1) {
            holding = false;
            suppressNextClick = true;
            syntheticClick = true;
            btn.click();
            syntheticClick = false;
            celebrateDone();
          }
        }
        active = true;
      }
      btn.style.transform = `translate3d(${sWobble.x.toFixed(2)}px, 0, 0) scale(${sScale.x.toFixed(4)})`;
      return active;
    };

    btn.addEventListener('pointerdown', ev => {
      if (ev.button !== 0 || btn.disabled) return;
      holding = true;
      suppressNextClick = false;
      holdStart = performance.now();
      sScale.target = 0.975;
      wake(tick);
    });

    const releaseHold = () => {
      if (!holding) return;
      const elapsed = performance.now() - holdStart;
      holding = false;
      sScale.target = 1;
      setSweep(0);
      if (elapsed >= QUICK_TAP_MS && elapsed < HOLD_MS) {
        // Released midway through hold -> tactile wobble & cancel click
        suppressNextClick = true;
        sWobble.v = 190;
        sWobble.target = 0;
      }
      wake(tick);
    };
    window.addEventListener('pointerup', releaseHold);
    btn.addEventListener('pointercancel', releaseHold);

    btn.addEventListener('click', ev => {
      if (!syntheticClick && suppressNextClick) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        suppressNextClick = false;
      }
    }, true);

    // Also celebrate when a fast click completes export
    const statusEl = document.getElementById('download-status');
    if (statusEl) {
      const stMo = new MutationObserver(() => {
        const txt = statusEl.textContent || '';
        if (/Файл готов|PNG дайын|Файл дайын/i.test(txt) && !btn.classList.contains('is-done')) {
          celebrateDone();
        }
      });
      stMo.observe(statusEl, { childList: true, characterData: true, subtree: true });
    }
  }

  // =========================================================================
  // 10. NEW PRO-EDITOR: DETENT DIAL (#56) — 270deg radial SVG tick dial (#photo-rotation)
  // =========================================================================
  function initEditorDetentDial() {
    const input = document.getElementById('photo-rotation');
    const host = input?.closest('.studio-range');
    if (!input || !host) return;
    mountedComponents.push('detent-dial');

    const MIN = Number(input.min) || -180;
    const MAX = Number(input.max) || 180;
    const DETENTS = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
    const SNAP_TOL = 4;
    input.classList.add('mk-upgraded-range');

    const wrap = document.createElement('div');
    wrap.className = 'mk-dial-wrap';

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'mk-dial-svg');
    svg.setAttribute('viewBox', '0 0 88 88');
    svg.setAttribute('role', 'slider');
    svg.setAttribute('tabindex', '0');
    svg.setAttribute('aria-label', isKk() ? 'Фотоны бұру' : 'Поворот фото');
    svg.setAttribute('aria-valuemin', String(MIN));
    svg.setAttribute('aria-valuemax', String(MAX));
    svg.setAttribute('aria-valuenow', String(input.value || 0));

    const CX = 44, CY = 44;
    const tickEls = [];
    const TICK_COUNT = 37; // -180..+180 step 10deg mapped across 270deg arc (-135..+135 from top)
    for (let i = 0; i < TICK_COUNT; i++) {
      const degVal = MIN + (i / (TICK_COUNT - 1)) * (MAX - MIN);
      const isMajor = degVal % 45 === 0;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('class', 'mk-dial-tick' + (isMajor ? ' is-major' : ''));
      svg.append(line);
      tickEls.push({ el: line, degVal, isMajor });
    }

    const knob = document.createElementNS(NS, 'circle');
    knob.setAttribute('class', 'mk-dial-knob');
    knob.setAttribute('cx', String(CX));
    knob.setAttribute('cy', String(CY));
    knob.setAttribute('r', '21');
    svg.append(knob);

    const needle = document.createElementNS(NS, 'line');
    needle.setAttribute('class', 'mk-dial-needle');
    svg.append(needle);

    const info = document.createElement('div');
    info.className = 'mk-dial-info';
    const degReadout = document.createElement('span');
    degReadout.className = 'mk-dial-deg';
    const hint = document.createElement('span');
    hint.className = 'mk-dial-hint';
    const updateHintText = () => {
      hint.textContent = isKk()
        ? 'Тартыңыз · 45° магнит · 2× басу — 0°'
        : 'Тяните · магнит 45° · 2× клик — 0°';
    };
    updateHintText();
    info.append(degReadout, hint);

    wrap.append(svg, info);
    host.append(wrap);

    const sDeg = makeSpring(Number(input.value) || 0, 360, 26, 1, 0.06);
    const sPulse = makeSpring(0, 520, 24);
    let dragging = false;
    let startX = 0;
    let startDeg = 0;
    let lastDetent = 0;

    function valToRad(degVal) {
      // Map [-180, 180] to visual angle [-135deg, +135deg] relative to 12 o'clock (-90deg)
      const visualDeg = (degVal / 180) * 135 - 90;
      return (visualDeg * Math.PI) / 180;
    }

    function paint() {
      const cur = Math.max(MIN, Math.min(MAX, sDeg.x));
      const rRad = valToRad(cur);
      const pulse = sPulse.x;

      tickEls.forEach(t => {
        const rad = valToRad(t.degVal);
        const dist = Math.abs(t.degVal - cur);
        const wave = dist < 40 ? Math.cos((dist / 40) * (Math.PI / 2)) : 0;
        const rInner = 27.5 - wave * 1.4;
        const rOuter = (t.isMajor ? 36.5 : 33.2) + wave * 4.2;
        t.el.setAttribute('x1', (CX + Math.cos(rad) * rInner).toFixed(2));
        t.el.setAttribute('y1', (CY + Math.sin(rad) * rInner).toFixed(2));
        t.el.setAttribute('x2', (CX + Math.cos(rad) * rOuter).toFixed(2));
        t.el.setAttribute('y2', (CY + Math.sin(rad) * rOuter).toFixed(2));
        t.el.classList.toggle('is-near', dist < 16);
      });

      const nStart = 6;
      const nEnd = 17.5 + pulse * 1.8;
      needle.setAttribute('x1', (CX + Math.cos(rRad) * nStart).toFixed(2));
      needle.setAttribute('y1', (CY + Math.sin(rRad) * nStart).toFixed(2));
      needle.setAttribute('x2', (CX + Math.cos(rRad) * nEnd).toFixed(2));
      needle.setAttribute('y2', (CY + Math.sin(rRad) * nEnd).toFixed(2));

      const rounded = Math.round(cur);
      const prefix = rounded > 0 ? '+' : '';
      degReadout.textContent = `${prefix}${rounded}°`;
      svg.setAttribute('aria-valuenow', String(rounded));
    }

    const tick = dt => {
      const a = stepSpring(sDeg, dt);
      const b = stepSpring(sPulse, dt);
      paint();
      return a || b;
    };

    function applyDeg(raw, snap = true, fireChange = false) {
      let next = Math.max(MIN, Math.min(MAX, Math.round(raw)));
      if (snap) {
        for (const d of DETENTS) {
          if (Math.abs(next - d) <= SNAP_TOL) {
            next = d;
            if (lastDetent !== d) {
              lastDetent = d;
              sPulse.v = 14; sPulse.target = 0;
            }
            break;
          }
        }
      }
      sDeg.target = next;
      dispatchRange(input, next, fireChange);
      wake(tick);
    }

    svg.addEventListener('pointerdown', ev => {
      ev.preventDefault();
      dragging = true;
      startX = ev.clientX;
      startDeg = Number(input.value) || 0;
      svg.classList.add('is-dragging');
      svg.setPointerCapture?.(ev.pointerId);
    });
    svg.addEventListener('pointermove', ev => {
      if (!dragging) return;
      const delta = (ev.clientX - startX) * 1.35;
      applyDeg(startDeg + delta, !ev.altKey, false);
    });
    const endDial = ev => {
      if (!dragging) return;
      dragging = false;
      svg.classList.remove('is-dragging');
      svg.releasePointerCapture?.(ev.pointerId);
      applyDeg(Number(input.value) || 0, true, true);
    };
    svg.addEventListener('pointerup', endDial);
    svg.addEventListener('pointercancel', endDial);

    svg.addEventListener('wheel', ev => {
      ev.preventDefault();
      const step = ev.shiftKey ? 15 : 3;
      const dir = ev.deltaY > 0 ? -1 : 1;
      applyDeg((Number(input.value) || 0) + dir * step, false, true);
    }, { passive: false });

    svg.addEventListener('dblclick', () => applyDeg(0, true, true));
    svg.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') { ev.preventDefault(); applyDeg((Number(input.value) || 0) + (ev.shiftKey ? 15 : 5), false, true); }
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') { ev.preventDefault(); applyDeg((Number(input.value) || 0) - (ev.shiftKey ? 15 : 5), false, true); }
      if (ev.key === '0' || ev.key === 'Home') { ev.preventDefault(); applyDeg(0, true, true); }
    });

    watchRangeSync(input, 'photo-rotation-value', val => {
      if (dragging) return;
      sDeg.target = val;
      wake(tick);
    });
    document.addEventListener('satucard:language-change', updateHintText);
    paint();
  }

  // =========================================================================
  // 11. NEW PRO-EDITOR: EXPOSURE SLIDERS (#60) — Camera ruler notches (brightness & contrast)
  // =========================================================================
  function initEditorExposureSliders() {
    const specs = [
      { id: 'photo-brightness', outputId: 'photo-brightness-value', def: 100 },
      { id: 'photo-contrast', outputId: 'photo-contrast-value', def: 100 }
    ];
    let mounted = false;

    specs.forEach(({ id, outputId, def }) => {
      const input = document.getElementById(id);
      const host = input?.closest('.studio-range');
      if (!input || !host) return;
      mounted = true;

      const MIN = Number(input.min) || 50;
      const MAX = Number(input.max) || 150;
      input.classList.add('mk-upgraded-range');

      const box = document.createElement('div');
      box.className = 'mk-exposure-slider';
      box.title = isKk() ? '2× басу — 100%' : 'Двойной клик — 100%';
      const ruler = document.createElement('div');
      ruler.className = 'mk-exposure-ruler';
      const NOTCHES = 21;
      const notchEls = [];
      for (let i = 0; i < NOTCHES; i++) {
        const n = document.createElement('i');
        n.className = 'mk-exposure-notch' + (i % 5 === 0 ? ' is-major' : '');
        ruler.append(n);
        notchEls.push(n);
      }
      const needle = document.createElement('span');
      needle.className = 'mk-exposure-needle';
      box.append(ruler, needle);
      host.append(box);

      const toPct = v => Math.max(0, Math.min(1, (v - MIN) / (MAX - MIN)));
      const sPct = makeSpring(toPct(Number(input.value) || def), 300, 30, 0.5);
      let dragging = false;

      function paint() {
        const p = Math.max(0, Math.min(1, sPct.x));
        const w = box.clientWidth || 220;
        const pad = 8;
        const xPx = pad + p * (w - pad * 2);
        needle.style.left = '0';
        needle.style.transform = `translate3d(${xPx.toFixed(2)}px, 0, 0)`;
        const centerIdx = (NOTCHES - 1) / 2;
        const curIdx = p * (NOTCHES - 1);
        const lo = Math.min(centerIdx, curIdx);
        const hi = Math.max(centerIdx, curIdx);
        notchEls.forEach((n, idx) => {
          n.classList.toggle('is-lit', idx >= lo - 0.35 && idx <= hi + 0.35);
        });
      }

      const tick = dt => {
        const active = stepSpring(sPct, dt);
        paint();
        return active;
      };

      function setFromClientX(clientX, fireChange = false) {
        const rect = box.getBoundingClientRect();
        const p = Math.max(0, Math.min(1, (clientX - rect.left - 8) / Math.max(1, rect.width - 16)));
        let val = Math.round(MIN + p * (MAX - MIN));
        if (Math.abs(val - def) <= 2) val = def; // subtle magnetic center at 100%
        sPct.target = toPct(val);
        dispatchRange(input, val, fireChange);
        wake(tick);
      }

      box.addEventListener('pointerdown', ev => {
        ev.preventDefault();
        dragging = true;
        box.setPointerCapture?.(ev.pointerId);
        setFromClientX(ev.clientX, false);
      });
      box.addEventListener('pointermove', ev => {
        if (dragging) setFromClientX(ev.clientX, false);
      });
      const endDrag = ev => {
        if (!dragging) return;
        dragging = false;
        box.releasePointerCapture?.(ev.pointerId);
        setFromClientX(ev.clientX, true);
      };
      box.addEventListener('pointerup', endDrag);
      box.addEventListener('pointercancel', endDrag);
      box.addEventListener('dblclick', () => {
        sPct.target = toPct(def);
        dispatchRange(input, def, true);
        wake(tick);
      });

      watchRangeSync(input, outputId, val => {
        if (dragging) return;
        sPct.target = toPct(val);
        wake(tick);
      });

      const ro = new ResizeObserver(() => paint());
      ro.observe(box);
      paint();
    });

    if (mounted) mountedComponents.push('exposure-slider');
  }

  // =========================================================================
  // 12. NEW PRO-EDITOR: SCRUBBERS (#72) — Compact 9-tick drag scrubbers
  // =========================================================================
  function initEditorScrubbers() {
    const specs = [
      { id: 'photo-saturation', outputId: 'photo-saturation-value', def: 100 },
      { id: 'photo-warmth', outputId: 'photo-warmth-value', def: 0 },
      { id: 'photo-blur', outputId: 'photo-blur-value', def: 0 },
      { id: 'photo-radius', outputId: 'photo-radius-value', def: 24 }
    ];
    let mounted = false;

    specs.forEach(({ id, outputId, def }) => {
      const input = document.getElementById(id);
      const host = input?.closest('.studio-range');
      if (!input || !host) return;
      mounted = true;

      const MIN = Number(input.min) || 0;
      const MAX = Number(input.max) || 100;
      input.classList.add('mk-upgraded-range');

      const bar = document.createElement('div');
      bar.className = 'mk-scrubber';
      bar.title = isKk() ? `2× басу — ${def}` : `Двойной клик — ${def}`;
      const fill = document.createElement('div');
      fill.className = 'mk-scrubber-fill';
      const ticksWrap = document.createElement('div');
      ticksWrap.className = 'mk-scrubber-ticks';
      const TICKS = 9;
      const tickEls = [];
      for (let i = 0; i < TICKS; i++) {
        const t = document.createElement('i');
        ticksWrap.append(t);
        tickEls.push(t);
      }
      bar.append(fill, ticksWrap);
      host.append(bar);

      const toPct = v => Math.max(0, Math.min(1, (v - MIN) / (MAX - MIN)));
      const sPct = makeSpring(toPct(Number(input.value) || def), 340, 28, 0.7);
      let dragging = false;

      function paint() {
        const p = Math.max(0, Math.min(1, sPct.x));
        fill.style.width = `${(p * 100).toFixed(2)}%`;
        const litUpTo = p * (TICKS - 1);
        tickEls.forEach((t, idx) => t.classList.toggle('is-lit', idx <= litUpTo + 0.15));
      }

      const tick = dt => {
        const active = stepSpring(sPct, dt);
        paint();
        return active;
      };

      function setFromClientX(clientX, fireChange = false) {
        const rect = bar.getBoundingClientRect();
        const p = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
        const val = Math.round(MIN + p * (MAX - MIN));
        sPct.target = p;
        dispatchRange(input, val, fireChange);
        wake(tick);
      }

      bar.addEventListener('pointerdown', ev => {
        ev.preventDefault();
        dragging = true;
        bar.classList.add('is-dragging');
        bar.setPointerCapture?.(ev.pointerId);
        setFromClientX(ev.clientX, false);
      });
      bar.addEventListener('pointermove', ev => {
        if (dragging) setFromClientX(ev.clientX, false);
      });
      const endScrub = ev => {
        if (!dragging) return;
        dragging = false;
        bar.classList.remove('is-dragging');
        bar.releasePointerCapture?.(ev.pointerId);
        setFromClientX(ev.clientX, true);
      };
      bar.addEventListener('pointerup', endScrub);
      bar.addEventListener('pointercancel', endScrub);
      bar.addEventListener('dblclick', () => {
        sPct.target = toPct(def);
        dispatchRange(input, def, true);
        wake(tick);
      });

      watchRangeSync(input, outputId, val => {
        if (dragging) return;
        sPct.target = toPct(val);
        wake(tick);
      });
      paint();
    });

    if (mounted) mountedComponents.push('scrubber');
  }

  // =========================================================================
  // 13. NEW PRO-EDITOR: COPY BUTTON (#38) & UNDO PULSE (#76)
  // =========================================================================
  function initEditorCopyAndUndo() {
    const copyBtn = document.getElementById('copy-card-image');
    const undoBtn = document.getElementById('undo-button');
    const redoBtn = document.getElementById('redo-button');
    const statusEl = document.getElementById('download-status');
    let mounted = false;

    if (copyBtn) {
      mounted = true;
      const labelSpan = copyBtn.querySelector('span');
      const iconUse = copyBtn.querySelector('use');
      let copyTimer = 0;
      let awaitingCopy = false;

      copyBtn.addEventListener('click', () => {
        awaitingCopy = true;
        setTimeout(() => { awaitingCopy = false; }, 2200);
      });

      if (statusEl && labelSpan) {
        const mo = new MutationObserver(() => {
          if (!awaitingCopy) return;
          const txt = statusEl.textContent || '';
          if (/скопирована|көшірілді/i.test(txt)) {
            awaitingCopy = false;
            clearTimeout(copyTimer);
            const origText = isKk() ? 'Көшіру' : 'Копировать';
            copyBtn.classList.add('is-copied');
            labelSpan.textContent = isKk() ? 'Көшірілді ✓' : 'Скопировано ✓';
            if (iconUse) iconUse.setAttribute('href', '#i-check');
            copyTimer = setTimeout(() => {
              copyBtn.classList.remove('is-copied');
              labelSpan.textContent = origText;
              if (iconUse) iconUse.setAttribute('href', '#i-copy');
            }, 1800);
          }
        });
        mo.observe(statusEl, { childList: true, characterData: true, subtree: true });
      }
    }

    const pulseBtn = el => {
      if (!el || el.disabled || isReduced()) return;
      el.classList.remove('mk-undo-pulse');
      void el.offsetWidth;
      el.classList.add('mk-undo-pulse');
    };

    if (undoBtn || redoBtn) {
      mounted = true;
      undoBtn?.addEventListener('click', () => pulseBtn(undoBtn));
      redoBtn?.addEventListener('click', () => pulseBtn(redoBtn));
      document.addEventListener('keydown', ev => {
        if (!(ev.ctrlKey || ev.metaKey)) return;
        const k = ev.key.toLowerCase();
        if (k === 'z' && !ev.shiftKey) pulseBtn(undoBtn);
        else if ((k === 'z' && ev.shiftKey) || k === 'y') pulseBtn(redoBtn);
      });
    }

    if (mounted) mountedComponents.push('copy-undo-pulse');
  }

  // =========================================================================
  // BOOT — Only activates components present in the current page's DOM
  // =========================================================================
  function boot() {
    initRubberDocks();
    initMorphTooltip();
    initCommandButton();
    initFanCards();
    initPlanSwitch();
    initEditorFileDrop();
    initEditorSpringyInputs();
    initEditorJellySlider();
    initEditorHoldToPublish();
    initEditorDetentDial();
    initEditorExposureSliders();
    initEditorScrubbers();
    initEditorCopyAndUndo();

    window.__SATUCARD_MOTION_KIT = {
      components: mountedComponents,
      activeTickers: () => tickers.size
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
