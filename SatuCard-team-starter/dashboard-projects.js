'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const list = $('dashboard-project-list');
  let generation = 0, nextOffset = null, searchTimer, knownUserId;

  function action(text, handler) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'button button-light'; button.textContent = text;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await handler(); }
      catch (error) { $('projects-status').textContent = error.message; $('projects-status').dataset.state = 'error'; }
      finally { button.disabled = false; }
    });
    return button;
  }

  function row(project) {
    const item = document.createElement('li');
    item.className = 'cloud-project-card';
    if (project.thumbnail?.startsWith('data:image/jpeg;base64,')) {
      const preview = document.createElement('img');
      preview.src = project.thumbnail; preview.alt = ''; preview.loading = 'lazy'; item.append(preview);
    } else {
      const preview = document.createElement('div');
      preview.className = 'project-preview-placeholder'; preview.setAttribute('aria-hidden', 'true');
      preview.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h3"/></svg>';
      item.append(preview);
    }
    const label = document.createElement('span');
    label.className = 'project-card-copy';
    const title = document.createElement('strong'); title.textContent = project.title;
    const date = document.createElement('time'); date.dateTime = project.updatedAt;
    date.textContent = new Date(project.updatedAt).toLocaleString('ru-RU');
    label.append(title, date);
    const link = document.createElement('a');
    link.className = 'button button-light';
    link.textContent = 'Редактировать'; link.href = 'editor.html?project=' + encodeURIComponent(project.id);
    const archive = action(project.archived ? 'Вернуть из архива' : 'В архив', async () => {
      const selectedGeneration = generation;
      const { project: current } = await window.SATUCARD_CLOUD.read(project.id);
      if (selectedGeneration !== generation) return;
      if (current.version !== project.version) throw new Error('Проект изменён. Обновите список.');
      await window.SATUCARD_CLOUD.save({
        id: project.id, version: project.version, title: project.title,
        payload: current.payload, archived: !project.archived,
      });
      if (selectedGeneration === generation) await load();
    });
    const remove = action('Удалить', async () => {
      if (!confirm('Удалить облачный проект «' + project.title + '»? Это действие нельзя отменить.')) return;
      const selectedGeneration = generation;
      await window.SATUCARD_CLOUD.remove(project.id, project.version);
      if (selectedGeneration === generation) await load();
    });
    remove.classList.add('button-danger');
    const actions = document.createElement('div'); actions.className = 'project-card-actions';
    actions.append(link, archive, remove);
    item.append(label, actions);
    return item;
  }

  async function load(more = false) {
    const selectedGeneration = ++generation;
    const offset = more ? nextOffset : 0;
    if (more && offset === null) return;
    $('projects-refresh').disabled = true;
    $('projects-more').disabled = true;
    $('projects-status').textContent = 'Загружаем проекты…';
    $('projects-status').dataset.state = 'loading';
    list.setAttribute('aria-busy', 'true');
    if ($('projects-loading')) $('projects-loading').hidden = more || list.children.length > 0;
    if ($('projects-empty')) $('projects-empty').hidden = true;
    try {
      const result = await window.SATUCARD_CLOUD.list({
        offset: String(offset), q: $('projects-search').value.trim(),
        archived: $('projects-archived').checked ? '1' : '0',
      });
      if (selectedGeneration !== generation) return;
      if (!more) list.replaceChildren();
      list.append(...result.projects.map(row));
      nextOffset = result.nextOffset ?? null;
      $('projects-more').hidden = nextOffset === null;
      $('projects-status').textContent = list.children.length ? 'Проектов показано ' + list.children.length : 'Проектов не найдено. Создайте товар в редакторе или измените поиск.';
      $('projects-status').dataset.state = list.children.length ? 'ready' : 'empty';
      if ($('projects-empty')) {
        $('projects-empty').hidden = list.children.length > 0;
        $('projects-empty').querySelector('span').textContent = $('projects-search').value.trim() ? 'Проектов с таким названием нет' : $('projects-archived').checked ? 'В архиве пока нет проектов' : 'Сохраните первый проект в облако из редактора';
      }
    } catch (error) {
      if (selectedGeneration === generation) {
        $('projects-status').textContent = error.message || 'Не удалось загрузить проекты. Нажмите «Обновить проекты».';
        $('projects-status').dataset.state = 'error';
      }
    } finally {
      if (selectedGeneration === generation) {
        list.setAttribute('aria-busy', 'false');
        if ($('projects-loading')) $('projects-loading').hidden = true;
        $('projects-refresh').disabled = false;
        $('projects-more').disabled = false;
      }
    }
  }

  $('projects-refresh').addEventListener('click', () => load());
  $('projects-more').addEventListener('click', () => load(true));
  $('projects-archived').addEventListener('change', () => load());
  $('projects-search').addEventListener('input', () => {
    generation++;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => load(), 250);
  });
  document.addEventListener('satucard:authchange', event => {
    const id = event.detail?.user?.id || null;
    if (knownUserId === id) return;
    knownUserId = id; generation++; list.replaceChildren();
    if (id) load();
    else {
      nextOffset = null; $('projects-more').hidden = true;
      if ($('projects-loading')) $('projects-loading').hidden = true;
      list.setAttribute('aria-busy', 'false');
      $('projects-status').textContent = 'Войдите, чтобы открыть облачные проекты.';
      $('projects-status').dataset.state = 'empty';
    }
  });
  window.SATUCARD_AUTH?.getSession().then(session => {
    knownUserId = session?.user?.id || null;
    if (knownUserId) load();
  });
});
