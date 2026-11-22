'use strict';

// Page-specific interactions for the home page, editor, templates and pricing.
window.SATUCARD_INIT_PAGE_MOTION = ({makeSpring, stepSpring, wake, mountedComponents, isReduced, isLightweight, isKk, attachRubberDock}) => {
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

  function initRubberDocks() {
    let count = 0;
    const add = (el, sel, check, opts) => {
      if (!el) return;
      attachRubberDock(el, sel, check, opts);
      count += 1;
    };

    add(document.getElementById('main-nav'), 'a', el => el.getAttribute('aria-current') === 'page', {followHover: true});
    add(document.querySelector('.hero-style-bar'), 'button[data-cover-style]', el => el.getAttribute('aria-pressed') === 'true');
    add(document.querySelector('.quick-styles'), 'button[data-hero-style]', el => el.getAttribute('aria-pressed') === 'true');
    add(document.querySelector('.gallery-filters'), 'button[data-template-filter]', el => el.getAttribute('aria-pressed') === 'true');
    add(document.querySelector('.studio-tabs'), 'button[data-editor-tab]', el => el.getAttribute('aria-selected') === 'true');
    add(document.querySelector('.studio-filters'), 'button[data-photo-filter]', el => el.getAttribute('aria-pressed') === 'true');
    add(document.querySelector('.format-pills'), 'button[data-format-pill]', el => el.getAttribute('aria-pressed') === 'true');
    if (count && !mountedComponents.includes('rubber-dock')) mountedComponents.push('rubber-dock');
  }

  // =========================================================================
  // Command button for the template gallery
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
    if (!stage || !renderer || isLightweight()) return;
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

  async function initPlanSwitch() {
    const switcher = document.getElementById('sai-plan-switch');
    if (!switcher) return;
    const { BILLING_PLANS } = await import('./billing-plans.js');
    const drum = document.getElementById('sai-price-drum'), badge = document.getElementById('sai-token-badge');
    const caption = document.getElementById('sai-plan-caption'), bonus = document.getElementById('sai-bonus-row');
    const bonusText = document.getElementById('sai-bonus-text'), cta = document.getElementById('sai-plan-cta');
    const buttons = [...switcher.querySelectorAll('[data-sai-plan]')], cycles = [...document.querySelectorAll('[data-billing-cycle]')];
    const requestedPlan = new URLSearchParams(location.search).get('plan');
    let key = BILLING_PLANS.some(p => p.id === requestedPlan) ? requestedPlan : 'max', yearly = false, rollers = [], bonusHeight = 28;
    const pop = makeSpring(1,520,16), height = makeSpring(1,260,24), choiceFade = makeSpring(1,420,32);
    const dock = attachRubberDock(switcher, '[data-sai-plan]', el => el.getAttribute('aria-checked') === 'true', {lead:[620,36],trail:[190,19]});
    attachRubberDock(document.querySelector('.billing-cycle'), '[data-billing-cycle]', el => el.getAttribute('aria-checked') === 'true', {lead:[620,36],trail:[190,19]});
    const tick = dt => {
      let active = false;
      for (const r of rollers) {
        r.delay -= dt;
        if (r.delay > 0 && !isReduced()) { active = true; continue; }
        active = stepSpring(r.s,dt) || active;
        r.strip.style.transform = 'translateY(' + (-r.s.x * 1.08).toFixed(4) + 'em)';
      }
      active = stepSpring(choiceFade,dt) || active;
      caption.style.opacity = Math.max(0,Math.min(1,choiceFade.x)).toFixed(3);
      active = stepSpring(pop,dt) || active; active = stepSpring(height,dt) || active;
      badge.style.transform = 'scale(' + pop.x.toFixed(4) + ')';
      bonus.style.height = Math.max(0, height.x * bonusHeight).toFixed(2) + 'px';
      bonus.style.opacity = Math.max(0,Math.min(1,height.x)).toFixed(3);
      return active;
    };
    function price(amount, animate) {
      const chars = new Intl.NumberFormat('ru-RU').format(amount).replace(/\s/g,' ');
      const digits = chars.replace(/ /g,'').split('').map(Number);
      if (rollers.length !== digits.length) {
        drum.replaceChildren(); rollers = [];
        for (const ch of chars) {
          const col = document.createElement('span'); col.setAttribute('aria-hidden','true');
          if (ch === ' ') { col.className = 'mk-digit-sep'; col.textContent = '\u00a0'; }
          else {
            col.className = 'mk-digit-col';
            const strip = document.createElement('span'); strip.className = 'mk-digit-strip';
            for (let n=0;n<10;n++) { const d=document.createElement('span'); d.textContent=n; strip.append(d); }
            const s = makeSpring(animate ? 0 : Number(ch),260,22+rollers.length*2,1,.005);
            rollers.push({strip,s,delay:0}); col.append(strip);
          }
          drum.append(col);
        }
        const currency=document.createElement('span'); currency.textContent='\u00a0₸'; currency.setAttribute('aria-hidden','true'); drum.append(currency);
      }
      rollers.forEach((r,i) => { r.s.target=digits[i]; r.delay=animate?i*.045:0; if(!animate){r.s.x=digits[i];r.s.v=0;} });
      drum.setAttribute('role','img'); drum.setAttribute('aria-label', amount + ' ₸');
    }
    function href() {
      const url=new URL('dashboard.html#billing-title',location.href);
      url.searchParams.set('plan', key+(yearly?'_yearly':''));
      if(document.documentElement.dataset.theme) url.searchParams.set('theme',document.documentElement.dataset.theme);
      return url.href;
    }
    function sync(animate=true) {
      const plan=BILLING_PLANS.find(p=>p.id===key), kk=isKk();
      buttons.forEach(b=>{const yes=b.dataset.saiPlan===key;b.setAttribute('aria-checked',yes);b.tabIndex=yes?0:-1;});
      cycles.forEach(b=>{const yes=(b.dataset.billingCycle==='yearly')===yearly;b.setAttribute('aria-checked',yes);b.tabIndex=yes?0:-1;});
      price(plan.priceKzt*(yearly?12:1),animate);
      badge.textContent = Math.round(plan.tokens/1e6)+(kk?' млн токен':' млн токенов');
      document.querySelector('.mk-plan-period').textContent = yearly ? (kk?'жылға · лимит ай сайын':'за год · лимит каждый месяц') : (kk?'30 күнге · автоматты төлемсіз':'за 30 дней · без автосписания');
      caption.textContent = yearly ? (kk?'12 айға бір төлем. Лимит қалдығы келесі айға өтпейді.':'Одна оплата на 12 месяцев. Неиспользованный лимит не переносится.') : (kk?'Мәтіндер мен RU / KZ аудармасына арналған sAI.':'sAI для текстов, описаний и перевода RU / KZ.');
      bonusText.textContent = plan.models.join(' · ');
      bonusHeight = bonus.firstElementChild?.scrollHeight || 28; height.target=1;
      cta.href=href(); dock?.syncActive(!animate);
      document.querySelectorAll('#pricing-plans [data-plan]').forEach(card=>card.classList.toggle('mk-plan-highlighted',card.dataset.plan===key));
      if(animate){pop.x=.86;pop.v=3;choiceFade.x=.35;choiceFade.v=0;} wake(tick);
    }
    buttons.forEach(b=>b.addEventListener('click',()=>{key=b.dataset.saiPlan;sync();}));
    cycles.forEach(b=>b.addEventListener('click',()=>{
      yearly=b.dataset.billingCycle==='yearly';
      document.dispatchEvent(new CustomEvent('satucard:billing-cycle',{detail:yearly?'yearly':'monthly'}));sync();
    }));
    for(const group of [buttons,cycles]) group.forEach((b,i)=>b.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault(); const n=event.key==='Home'?0:event.key==='End'?group.length-1:(i+(event.key==='ArrowRight'?1:-1)+group.length)%group.length;
      group[n].click();group[n].focus();
    }));
    cta.addEventListener('click',()=>{cta.href=href();});
    document.addEventListener('satucard:language-change',()=>sync(false));
    document.getElementById('pricing-plans')?.addEventListener('click',event=>{
      const card=event.target.closest('[data-plan]');if(!card||event.target.closest('a,summary,details'))return;key=card.dataset.plan;sync();
    });
    mountedComponents.push('plan-switch'); sync(false);
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
    initCommandButton();
    initFanCards();
    initPlanSwitch();
    initEditorSpringyInputs();
    initEditorJellySlider();
    initEditorHoldToPublish();
    initEditorDetentDial();
    initEditorExposureSliders();
    initEditorScrubbers();
    initEditorCopyAndUndo();

  }

  boot();
};
