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
      let payload = {};
      try { payload = JSON.parse(entry.payload); } catch (_) { continue; }
      if (!payload || typeof payload !== 'object') continue;
      const row = document.createElement('li');
      const link = document.createElement('a');
      const image = document.createElement('img');
      const active = payload.views?.find(view => view.id === payload.activeViewId);
      const source = payload.photos?.find(photo => photo.id === active?.photoIds?.[0])?.source || payload.photo;
      if (source) { image.src = source; image.alt = ''; row.append(image); }
      else {
        const preview = document.createElement('div'); preview.className = 'project-preview-placeholder';
        preview.setAttribute('aria-hidden', 'true');
        preview.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h3"/></svg>';
        row.append(preview);
      }
      link.className = 'project-card-copy';
      const title = document.createElement('strong'); title.textContent = entry.title;
      const date = document.createElement('time'); date.dateTime = entry.updatedAt;
      date.textContent = new Date(entry.updatedAt).toLocaleString('ru-RU');
      link.append(title, date);
      link.href = 'editor.html?draft=' + encodeURIComponent(entry.id);
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'studio-small-button button-danger'; remove.textContent = 'Удалить';
      remove.addEventListener('click', async () => {
        if (!confirm('Удалить черновик «' + entry.title + '» с этого устройства?')) return;
        try {
          await window.SATUCARD_PROJECT.draftAction('delete', undefined, entry.id);
          localStorage.removeItem('satucard-journal-' + entry.id);
          entries = entries.filter(item => item.id !== entry.id);
          render();
        } catch (_) { status.textContent = 'Не удалось удалить черновик. Повторите действие.'; status.dataset.state = 'error'; }
      });
      row.append(link, remove); list.append(row);
    }
    status.textContent = query ? 'Найдено черновиков: ' + list.children.length : entries.length ? 'Сохраняются на этом устройстве. Для переноса скачайте проект или сохраните его в облаке.' : 'Сохранённых черновиков пока нет.';
    status.dataset.state = list.children.length ? 'ready' : 'empty';
    const empty = document.getElementById('local-project-empty');
    if (empty) {
      empty.hidden = list.children.length > 0;
      empty.querySelector('span').textContent = query ? 'Черновиков с таким названием нет' : 'Здесь появятся ваши черновики';
    }
  }

  async function load() {
    list.setAttribute('aria-busy', 'true');
    status.textContent = 'Открываем черновики…';
    try {
      const values = await window.SATUCARD_PROJECT.draftAction('list');
      entries = values.filter(entry => entry?.payload).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      render();
    } catch (_) {
      status.textContent = 'Хранилище недоступно. Сохраняйте проект файлом.'; status.dataset.state = 'error';
      const empty = document.getElementById('local-project-empty');
      if (empty) empty.hidden = true;
    } finally { list.setAttribute('aria-busy', 'false'); }
  }
  document.getElementById('open-local-projects')?.addEventListener('click', () => { dialog.showModal(); load(); });
  search.addEventListener('input', render);
  if (!dialog) load();
})();
