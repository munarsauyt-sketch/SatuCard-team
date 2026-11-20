'use strict';

// Progressive homepage motion: word-by-word scroll tagline reveal and subtle card spotlight.
// Content remains fully visible without JavaScript and under prefers-reduced-motion.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const taglines = [...document.querySelectorAll('[data-tagline-reveal]')];

  function currentText(el) {
    const lang = document.documentElement.lang === 'kk' ? 'kk' : 'ru';
    return (lang === 'kk' ? el.dataset.taglineKk : el.dataset.taglineRu) || el.textContent.trim();
  }

  function splitWords(el) {
    const words = currentText(el).split(/\s+/).filter(Boolean);
    el.textContent = '';
    const spans = [];
    words.forEach((word, index) => {
      const span = document.createElement('span');
      span.className = 'tagline-word';
      if (reduced.matches) span.classList.add('is-lit');
      span.textContent = word;
      el.append(span);
      if (index < words.length - 1) el.append(document.createTextNode(' '));
      spans.push(span);
    });
    el._taglineWords = spans;
    el.classList.add('is-word-split');
  }

  if (taglines.length) {
    const active = new Set();
    let raf = 0;

    function updateLit() {
      raf = 0;
      const vh = window.innerHeight || 900;
      for (const el of taglines) {
        const words = el._taglineWords || [];
        if (!words.length) continue;
        if (reduced.matches) {
          words.forEach(w => w.classList.add('is-lit'));
          continue;
        }
        const rect = el.getBoundingClientRect();
        // Progress 0 when top enters lower 88% of viewport, 1 when reaching upper 34%.
        const start = vh * 0.88;
        const end = vh * 0.34;
        const raw = (start - rect.top) / Math.max(1, start - end);
        const progress = Math.max(0, Math.min(1, raw));
        const litCount = progress <= 0.02 ? 0 : Math.ceil(progress * words.length);
        for (let i = 0; i < words.length; i++) {
          words[i].classList.toggle('is-lit', i < litCount);
        }
      }
    }

    function schedule() {
      if (!raf) raf = requestAnimationFrame(updateLit);
    }

    let activeLang = document.documentElement.lang === 'kk' ? 'kk' : 'ru';
    taglines.forEach(splitWords);

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) active.add(entry.target);
          else active.delete(entry.target);
        }
        schedule();
      }, { rootMargin: '120px 0px 120px 0px' });
      taglines.forEach(el => io.observe(el));
    } else {
      taglines.forEach(el => active.add(el));
    }

    window.addEventListener('scroll', () => { if (active.size) schedule(); }, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });

    const langObserver = new MutationObserver(() => {
      const nextLang = document.documentElement.lang === 'kk' ? 'kk' : 'ru';
      if (nextLang === activeLang) return;
      activeLang = nextLang;
      taglines.forEach(splitWords);
      schedule();
    });
    langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

    reduced.addEventListener('change', () => {
      taglines.forEach(splitWords);
      schedule();
    });

    updateLit();
  }

  // Subtle pointer spotlight on capability cards for fine pointer devices only.
  if (!reduced.matches && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const cards = document.querySelectorAll('.benefit-card');
    cards.forEach(card => {
      let frame = 0;
      let lastX = 0;
      let lastY = 0;
      card.addEventListener('pointermove', event => {
        const rect = card.getBoundingClientRect();
        lastX = event.clientX - rect.left;
        lastY = event.clientY - rect.top;
        if (!frame) {
          frame = requestAnimationFrame(() => {
            frame = 0;
            card.style.setProperty('--spot-x', lastX.toFixed(0) + 'px');
            card.style.setProperty('--spot-y', lastY.toFixed(0) + 'px');
          });
        }
      }, { passive: true });
    });
  }
})();
