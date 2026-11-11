'use strict';

(() => {
  const dialog = document.getElementById('local-projects-dialog');
  const list = document.getElementById('local-project-list');
  const search = document.getElementById('local-project-search');
  const status = document.getElementById('local-project-status');
  if (!list || !window.SATUCARD_PROJECT) return;
  let entries = [];

  function render() {
    list.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase('ru');
    for (const entry of entries.filter(item => item.title.toLocaleLowerCase('ru').includes(query))) {
      const row = document.createElement('li');
      const link = document.createElement('a');
      const payload = JSON.parse(entry.payload);
      const image = document.createElement('img');
      const active = payload.views?.find(view => view.id === payload.activeViewId);
      const source = payload.photos?.find(photo => photo.id === active?.photoIds?.[0])?.source || payload.photo;
      if (source) { image.src = source; image.alt = ''; row.append(image); }
      link.textContent = entry.title + ' · ' + new Date(entry.updatedAt).toLocaleString('ru-RU');
      link.href = 'editor.html?draft=' + encodeURIComponent(entry.id);
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'studio-small-button'; remove.textContent = 'Удалить';
      remove.addEventListener('click', async () => {
        if (!confirm('Удалить черновик «' + entry.title + '» с этого устройства?')) return;
        try {
          await window.SATUCARD_PROJECT.draftAction('delete', undefined, entry.id);
          localStorage.removeItem('satucard-journal-' + entry.id);
          entries = entries.filter(item => item.id !== entry.id);
          render();
        } catch (_) { status.textContent = 'Не удалось удалить черновик. Повторите действие.'; }
      });
      row.append(link, remove); list.append(row);
    }
    status.textContent = entries.length ? 'Сохраняются на этом устройстве. Для переноса скачайте проект или сохраните его в облаке.' : 'Сохранённых черновиков пока нет.';
  }

  async function load() {
    try {
      const values = await window.SATUCARD_PROJECT.draftAction('list');
      entries = values.filter(entry => entry?.payload).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      render();
    } catch (_) { status.textContent = 'Хранилище недоступно. Сохраняйте проект файлом.'; }
  }
  document.getElementById('open-local-projects')?.addEventListener('click', () => { dialog.showModal(); load(); });
  search.addEventListener('input', render);
  if (!dialog) load();
})();
