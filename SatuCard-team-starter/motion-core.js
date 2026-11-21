'use strict';

// Shared by all SatuCard headers. Page-specific effects are loaded only where used.
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const lightweight = window.matchMedia('(max-width: 767px), (pointer: coarse)');
  const isReduced = () => reduceMotion.matches || lightweight.matches;
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
    const steps = 4;
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

  // Shared RAF loop — sleeps completely (no animation work) when no spring is moving
  const tickers = new Set();
  let rafId = 0;
  let lastT = 0;

  function scheduleTick() {
    if (rafId || tickers.size === 0 || document.hidden) return;
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function loop(now) {
    rafId = 0;
    if (document.hidden) return;
    if (now - lastT < 1000 / 60 - 1) { rafId = requestAnimationFrame(loop); return; }
    const dt = Math.max(0.004, Math.min(0.05, (now - lastT) / 1000));
    lastT = now;
    for (const fn of [...tickers]) {
      const active = fn(dt, now);
      if (!active) tickers.delete(fn);
    }
    if (tickers.size > 0) rafId = requestAnimationFrame(loop);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; } else scheduleTick();
  });

  function wake(fn) {
    tickers.add(fn);
    scheduleTick();
  }

  function attachRubberDock(container, itemSelector, activeCheck, { lead = [640, 38], trail = [150, 16], followHover = false, persistent = true } = {}) {
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
        left: eRect.left - cRect.left - container.clientLeft + container.scrollLeft,
        right: eRect.right - cRect.left - container.clientLeft + container.scrollLeft,
        top: eRect.top - cRect.top - container.clientTop + container.scrollTop,
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
      pill.style.opacity = '1';
      currentEl = el;
      wake(tick);
    }

    function syncActive(instant = false) {
      const items = [...container.querySelectorAll(itemSelector)];
      const active = items.find(activeCheck) || (persistent ? items[0] : null);
      if (active) moveTo(active, instant);
      else { currentEl = null; pill.style.opacity = '0'; }
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
        if (item && container.contains(item) && item !== currentEl) moveTo(item, false);
      });
      container.addEventListener('pointerleave', () => syncActive(false));
      container.addEventListener('focusin', ev => { const item = ev.target.closest(itemSelector); if (item) moveTo(item); });
      container.addEventListener('focusout', ev => { if (!container.contains(ev.relatedTarget)) syncActive(false); });
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


  function initMorphTooltip() {
    const items = [...document.querySelectorAll('[data-morph-tip]')];
    if (!items.length || lightweight.matches) return;
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
      }, 140);
    }

    items.forEach(el => {
      // Prevent duplicate native browser title tooltip while keeping aria-label intact
      if (el.hasAttribute('title')) el.removeAttribute('title');
      el.addEventListener('pointerenter', () => showFor(el));
      el.addEventListener('focus', () => showFor(el));
      el.addEventListener('pointerleave', hide);
      el.addEventListener('blur', hide);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && activeEl) hide(); });
    window.addEventListener('scroll', () => { if (activeEl) hide(); }, { passive: true });
  }


  function start() {
    const controls = {makeSpring, stepSpring, wake, mountedComponents, isReduced, isLightweight: () => lightweight.matches, isKk, attachRubberDock};
    window.SATUCARD_MOTION_WORKSPACE?.(controls);
    window.SATUCARD_INIT_PAGE_MOTION?.(controls);
    initMorphTooltip();
    window.__SATUCARD_MOTION_KIT = {components: mountedComponents, activeTickers: () => tickers.size};
  }
  document.addEventListener('DOMContentLoaded', start, {once: true});
})();
