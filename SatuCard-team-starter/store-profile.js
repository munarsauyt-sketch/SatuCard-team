'use strict';

(() => {
  function start() {
    const editor = window.SATUCARD_EDITOR;
    const field = document.getElementById('brand-name');
    if (!editor || !field) return;
    const group = document.createElement('div');
    const status = document.createElement('p');
    status.setAttribute('role', 'status'); status.className = 'studio-help';
    const actions = [
      ['Сохранить стиль магазина', async () => {
        await window.SATUCARD_PROJECT.brandAction('put', editor.brandProfile());
        status.textContent = 'Название, логотип, шрифт и цвета сохранены на этом устройстве.';
      }],
      ['Применить сохранённый стиль', async () => {
        const value = await window.SATUCARD_PROJECT.brandAction('get');
        if (!value) throw new Error('Сначала сохраните стиль магазина.');
        await editor.applyBrandProfile(value);
        status.textContent = 'Стиль применён к текущей карточке. Действие можно отменить.';
      }],
    ];
    for (const [label, run] of actions) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'studio-small-button'; button.textContent = label;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await run(); } catch (error) { status.textContent = error.message || 'Хранилище недоступно.'; }
        finally { button.disabled = false; }
      });
      group.append(button);
    }
    group.append(status);
    field.closest('.accordion-content').append(group);
  }
  document.addEventListener('satucard:editor-ready', start, { once: true });
})();
