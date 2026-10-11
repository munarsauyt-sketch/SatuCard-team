'use strict';
document.documentElement.classList.add('js-ready');

document.addEventListener('DOMContentLoaded', () => {
  const menu = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('#main-nav');
  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      nav.classList.toggle('menu-open', open);
    });
    nav.addEventListener('click', event => {
      if (event.target.closest('a')) {
        menu.setAttribute('aria-expanded', 'false');
        nav.classList.remove('menu-open');
      }
    });
  }

  const toast = document.createElement('div');
  toast.className = 'site-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.append(toast);
  let timeout;
  window.satucardToast = (message, type = 'success') => {
    clearTimeout(timeout);
    toast.textContent = message;
    toast.className = `site-toast is-visible ${type}`;
    timeout = setTimeout(() => { toast.className = 'site-toast'; }, 4500);
  };

  const targets = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });
  targets.forEach(target => observer.observe(target));
});
