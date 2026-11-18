'use strict';

// Presentation only. Existing controllers still own data, tabs and validation.
(() => {
  const groups = [...document.querySelectorAll('.studio-tabs,.auth-tabs')];
  const updates = new Map();
  function update(group) {
    const active = group.querySelector('[aria-selected=true]');
    if (!active || !active.offsetWidth) return;
    group.style.setProperty('--segment-x', active.offsetLeft + 'px');
    group.style.setProperty('--segment-y', active.offsetTop + 'px');
    group.style.setProperty('--segment-w', active.offsetWidth + 'px');
    group.style.setProperty('--segment-h', active.offsetHeight + 'px');
    const inspector = document.querySelector('.inspector-tab-label');
    if (inspector && group.classList.contains('studio-tabs') && inspector.textContent !== active.textContent.trim()) inspector.textContent = active.textContent.trim();
    group.classList.add('segmented-enhanced');
  }
  const resize = 'ResizeObserver' in window ? new ResizeObserver(entries => entries.forEach(entry => update(entry.target))) : null;
  groups.forEach(group => {
    const observer = new MutationObserver(() => update(group));
    observer.observe(group, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
    updates.set(group, observer);
    resize?.observe(group);
    update(group);
  });
  document.fonts?.ready.then(() => groups.forEach(update));
  const language = new MutationObserver(() => requestAnimationFrame(() => groups.forEach(update)));
  language.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  window.addEventListener('pageshow', () => groups.forEach(update));
})();
