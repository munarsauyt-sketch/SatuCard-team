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
      catch (error) { $('projects-status').textContent = error.message; }
      finally { button.disabled = false; }
    });
    return button;
  }

  function row(project) {
    const item = document.createElement('li');
    if (project.thumbnail?.startsWith('data:image/jpeg;base64,')) {
      const preview = document.createElement('img');
      preview.src = project.thumbnail; preview.alt = ''; preview.loading = 'lazy'; item.append(preview);
    }
    const label = document.createElement('span');
    label.textContent = project.title + ' · ' + new Date(project.updatedAt).toLocaleString('ru-RU');
    const link = document.createElement('a');
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
    item.append(label, link, archive, remove);
    return item;
  }

  async function load(more = false) {
    const selectedGeneration = ++generation;
    const offset = more ? nextOffset : 0;
    if (more && offset === null) return;
    $('projects-refresh').disabled = true;
    $('projects-more').disabled = true;
    $('projects-status').textContent = 'Загружаем проекты…';
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
    } catch (error) {
      if (selectedGeneration === generation) $('projects-status').textContent = error.message;
    } finally {
      if (selectedGeneration === generation) {
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
  });
  window.SATUCARD_AUTH?.getSession().then(session => {
    knownUserId = session?.user?.id || null;
    if (knownUserId) load();
  });
});
