'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const status = document.getElementById('projects-status'), list = document.getElementById('dashboard-project-list'), refresh = document.getElementById('projects-refresh');
  let loading = false, generation = 0, knownUserId;
  window.SATUCARD_AUTH?.getSession().then(session => { if (knownUserId === undefined) knownUserId = session?.user?.id || null; });
  document.addEventListener('satucard:authchange', event => {
    const userId = event.detail?.user?.id || null;
    if (knownUserId !== undefined && userId !== knownUserId) { generation++; list.replaceChildren(); status.textContent = 'Аккаунт изменился. Обновите список проектов.'; }
    knownUserId = userId;
  });
  async function load() {
    if (loading) return; loading = true; const currentGeneration = generation; refresh.disabled = true; status.textContent = 'Загружаем проекты…';
    try {
      const { projects } = await window.SATUCARD_CLOUD.list(); if (currentGeneration !== generation) return; list.replaceChildren();
      for (const project of projects) {
        const row = document.createElement('li'), label = document.createElement('span'), link = document.createElement('a');
        label.textContent = `${project.title} · ${new Date(project.updatedAt).toLocaleString('ru-RU')}`;
        link.textContent = 'Редактировать'; link.href = `editor.html?project=${encodeURIComponent(project.id)}`;
        row.append(label, link); list.append(row);
      }
      status.textContent = projects.length ? `${projects.length} из последних 50 проектов` : 'В редакторе нажмите «Сохранить в облаке», и проект появится здесь.';
    } catch (error) { status.textContent = error.message; } finally { loading = false; refresh.disabled = false; }
  }
  refresh.addEventListener('click', load); load();
});
