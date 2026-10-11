'use strict';
document.documentElement.classList.add('js-ready');

document.addEventListener('DOMContentLoaded', () => {
  const menu = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('#main-nav');
  const header = document.querySelector('.site-header');
  if (header) {
    const updateHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 16);
    window.addEventListener('scroll', updateHeader, { passive: true });
    updateHeader();
  }
  if (menu && nav) {
    const closeMenu = () => {
      menu.setAttribute('aria-expanded', 'false');
      menu.setAttribute('aria-label', 'Открыть меню');
      nav.classList.remove('menu-open');
    };
    menu.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      nav.classList.toggle('menu-open', open);
    });
    nav.addEventListener('click', event => {
      if (event.target.closest('a')) {
        closeMenu();
      }
    });
    document.addEventListener('click', event => {
      if (!menu.contains(event.target) && !nav.contains(event.target)) closeMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
        closeMenu();
        menu.focus();
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
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    targets.forEach(target => target.classList.add('is-revealed'));
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });
  targets.forEach(target => observer.observe(target));
});
