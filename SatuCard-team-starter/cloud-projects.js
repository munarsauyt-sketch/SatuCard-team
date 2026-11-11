'use strict';

(() => {
  async function request(id, body, method, params = {}) {
    if (location.protocol === 'file:') throw new Error('Облачные проекты доступны на сайте SatuCard. Локально скачайте файл проекта.');
    const session = await window.SATUCARD_AUTH?.getSession();
    if (!session) throw new Error('Войдите в аккаунт и завершите профиль, чтобы работать с облачными проектами.');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const query = new URLSearchParams({ ...params, ...(id ? { id } : {}) });
      const response = await fetch('api/projects' + (query.size ? '?' + query : ''), {
        method: method || (body ? 'POST' : 'GET'), cache: 'no-store', signal: controller.signal,
        headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { const error = new Error(result.error || 'Не удалось открыть облачный проект.'); error.code = result.code; throw error; }
      // Never reveal or reuse a response after the user has switched accounts.
      const current = await window.SATUCARD_AUTH.getSession();
      if (current?.user?.id !== session.user?.id) throw new Error('Аккаунт изменился. Повторите действие.');
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Сервер не ответил. Если вы сохраняли проект, обновите список перед повтором: сохранение могло завершиться.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  window.SATUCARD_CLOUD = {
    list: params => request(null, null, 'GET', params),
    read: id => request(id),
    save: body => request(null, body),
    remove: (id, version) => request(id, null, 'DELETE', { version: String(version) })
  };
})();
