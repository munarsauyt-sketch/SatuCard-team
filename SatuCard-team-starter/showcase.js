'use strict';

// SatuCard Hero Coordinator — mounts the real-time 3D modeled exploded product
// card on desktop (>= 768px) with instant 2D SATUCARD_RENDERER fallback on
// mobile, reduced motion, or environments without WebGL.
(() => {
  const $ = id => document.getElementById(id);
  const frame = document.querySelector('.cover-frame');
  const viewport3d = $('hero-3d-viewport');
  const rig = $('hero-card-rig');
  const shadow = $('hero-card-shadow');
  const surface = $('hero-card-surface');
  const photo = $('cover-photo');
  const card = $('cover-card');
  const status = $('cover-status');
  const styleBar = frame?.querySelector('.hero-style-bar');
  const styleButtons = [...document.querySelectorAll('[data-cover-style]')];
  const explodeBtn = $('hero-explode-toggle');
  const dockDivider = $('hero-dock-divider');
  const hint3d = $('hero-3d-hint');
  const cta = $('hero-create-cta');
  const renderer = window.SATUCARD_RENDERER;
  const sample = window.SATUCARD_SAMPLES?.perfume || window.SATUCARD_SAMPLES?.sneaker;
  if (!frame || !rig || !surface || !photo || !card || !renderer || !sample) return;

  const IMAGE_SRC = window.SATUCARD_SAMPLES?.perfume ? 'assets/images/perfume.jpg' : 'assets/images/sneaker.jpg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const phone = matchMedia('(max-width: 767px)');
  const wants3D = () => !reduce.matches && !phone.matches && Boolean(viewport3d);

  let activeStyle = 'studio';
  let loadedImage = null;
  let hero3d = null;
  let mounting3d = false;
  let renderSeq = 0;

  function announce(text = '', error = false) {
    if (!status) return;
    status.classList.toggle('sr-only', !error);
    status.textContent = text;
  }

  function cardState(template) {
    return renderer.normalize({
      ...sample,
      template,
      format: 'portrait',
      font: 'manrope',
      showBrand: false
    });
  }

  function render2D(template) {
    if (!loadedImage) return null;
    const state = cardState(template);
    const buffer = document.createElement('canvas');
    const layout = renderer.render(buffer, state, { photo: loadedImage }, { scale: 1 });
    card.width = buffer.width;
    card.height = buffer.height;
    card.getContext('2d').drawImage(buffer, 0, 0);
    const label = renderer.templates[template]?.label || 'Студия';
    const priceLabel = new Intl.NumberFormat('ru-RU').format(state.price ?? 44900);
    card.setAttribute('aria-label', `Карточка товара «${state.title}» — ${priceLabel} ₸ (${label})`);
    frame.dataset.activeStyle = template;
    return layout;
  }

  function show2DMode() {
    if (hero3d) {
      try { hero3d.dispose(); } catch (_) {}
      hero3d = null;
    }
    if (viewport3d) viewport3d.hidden = true;
    rig.hidden = false;
    rig.style.transform = 'none';
    surface.style.clipPath = 'none';
    if (shadow) {
      shadow.style.opacity = '1';
      shadow.style.transform = 'translate3d(0px, 26px, 0) scale(1)';
    }
    card.hidden = false;
    photo.hidden = true;
    if (styleBar) {
      styleBar.hidden = false;
      styleBar.style.opacity = '1';
      styleBar.style.transform = 'none';
    }
    if (explodeBtn) {
      explodeBtn.hidden = true;
      explodeBtn.setAttribute('aria-pressed', 'false');
    }
    if (dockDivider) dockDivider.hidden = true;
    if (hint3d) hint3d.hidden = true;
    frame.dataset.heroMode = '2d';
    frame.dataset.heroStage = 'ready';
    window.__SATUCARD_HERO_STATE = {
      mode: '2d-canvas',
      phase: 'ready',
      style: activeStyle,
      webglActive: false
    };
  }

  function waitFor3DModule(timeoutMs = 3000) {
    if (typeof window.SATUCARD_MOUNT_HERO_3D === 'function') {
      return Promise.resolve(window.SATUCARD_MOUNT_HERO_3D);
    }
    return new Promise(resolve => {
      let done = false;
      const finish = fn => {
        if (done) return;
        done = true;
        window.removeEventListener('satucard:hero3d-ready', onReady);
        clearTimeout(timer);
        resolve(fn || null);
      };
      const onReady = () => finish(window.SATUCARD_MOUNT_HERO_3D);
      const timer = setTimeout(() => finish(window.SATUCARD_MOUNT_HERO_3D), timeoutMs);
      window.addEventListener('satucard:hero3d-ready', onReady, { once: true });
    });
  }

  async function enable3DMode() {
    if (hero3d || mounting3d || !loadedImage || !wants3D()) return;
    mounting3d = true;
    try {
      const mount = await waitFor3DModule();
      if (!mount || !wants3D() || !loadedImage) {
        show2DMode();
        return;
      }
      viewport3d.hidden = false;
      const controller = await mount({
        container: viewport3d,
        rendererApi: renderer,
        sample,
        image: loadedImage,
        initialStyle: activeStyle,
        onStageReady: () => {
          rig.hidden = true;
          if (styleBar) {
            styleBar.hidden = false;
            styleBar.style.opacity = '1';
            styleBar.style.transform = 'none';
          }
          if (explodeBtn) {
            explodeBtn.hidden = false;
            explodeBtn.setAttribute('aria-pressed', 'false');
          }
          if (dockDivider) dockDivider.hidden = false;
          if (hint3d) hint3d.hidden = false;
          frame.dataset.heroMode = '3d';
          frame.dataset.heroStage = 'ready';
        },
        onExplodeChange: isExploded => {
          if (explodeBtn) explodeBtn.setAttribute('aria-pressed', String(isExploded));
          announce(isExploded ? 'Взрыв-схема слоёв карточки включена.' : 'Карточка собрана.');
        },
        onFallback: () => {
          show2DMode();
        }
      });
      if (!controller) {
        show2DMode();
        return;
      }
      hero3d = controller;
      if (!wants3D()) {
        show2DMode();
      }
    } catch (_) {
      show2DMode();
    } finally {
      mounting3d = false;
    }
  }

  function selectStyle(style, { notify = true } = {}) {
    if (!renderer.templates[style] || !loadedImage) return;
    activeStyle = style;
    styleButtons.forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.coverStyle === style)));
    try {
      render2D(style);
      if (hero3d) {
        hero3d.setStyle(style);
      } else {
        window.__SATUCARD_HERO_STATE = {
          ...(window.__SATUCARD_HERO_STATE || {}),
          phase: 'ready',
          style
        };
      }
      if (notify) {
        document.dispatchEvent(new CustomEvent('satucard:hero-style', { detail: { style } }));
      }
      const label = renderer.templates[style]?.label || style;
      announce(`Выбран стиль «${label}».`);
    } catch (_) {
      announce('Не удалось перерисовать стиль. Попробуйте ещё раз.', true);
    }
  }

  styleButtons.forEach(button => {
    button.addEventListener('click', () => selectStyle(button.dataset.coverStyle));
  });

  if (explodeBtn) {
    explodeBtn.addEventListener('click', () => {
      if (!hero3d) return;
      hero3d.toggleExploded();
    });
  }

  if (cta) {
    cta.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('satucard:hero-style', { detail: { style: activeStyle, focus: true } }));
    });
  }

  function syncModeToEnvironment() {
    if (!loadedImage) return;
    if (wants3D()) {
      if (!hero3d) enable3DMode();
    } else if (hero3d || frame.dataset.heroMode === '3d') {
      show2DMode();
    }
  }

  reduce.addEventListener('change', syncModeToEnvironment);
  phone.addEventListener('change', syncModeToEnvironment);

  async function init() {
    const seq = ++renderSeq;
    // Prevent flat 2D image flash on desktop while WebGL 3D boots in parallel.
    if (wants3D()) frame.dataset.heroBoot = '3d';
    const img = new Image();
    img.src = IMAGE_SRC;
    try {
      await Promise.all([
        img.decode(),
        document.fonts?.load('600 40px "Manrope"').catch(() => {}),
        document.fonts?.load('800 40px "Manrope"').catch(() => {})
      ]);
      if (seq !== renderSeq) return;
      loadedImage = img;
      render2D(activeStyle);
      if (wants3D()) {
        await enable3DMode();
      } else {
        show2DMode();
      }
      delete frame.dataset.heroBoot;
    } catch (_) {
      delete frame.dataset.heroBoot;
      if (seq === renderSeq) {
        frame.dataset.heroStage = 'ready';
        announce('Не удалось загрузить пример.', true);
      }
    }
  }

  init();
})();
