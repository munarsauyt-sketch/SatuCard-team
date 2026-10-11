'use strict';

// Publishable keys identify the browser application; RLS protects user data.
// The Supabase secret key is used only by server functions.
window.SATUCARD_AUTH = (() => {
  const base = 'https://pnnaqvfcswdroldovbty.supabase.co';
  const key = 'sb_publishable_aGyscvYLYpZsyn3eG1c3mQ_I_W_pOBL';
  const storageKey = 'satucard-session-v1';
  let session = null;
  let refreshPromise = null;

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved?.access_token && saved?.refresh_token && saved?.user?.id) session = saved;
  } catch (_) {
    // Browsers may disable local storage for local files or private sessions.
  }

  function save(value) {
    session = value;
    try {
      if (value) localStorage.setItem(storageKey, JSON.stringify(value));
      else localStorage.removeItem(storageKey);
    } catch (_) {}
    document.dispatchEvent(new CustomEvent('satucard:authchange', { detail: { user: value?.user || null } }));
  }

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${base}${path}`, {
        ...options,
        headers: { apikey: key, 'content-type': 'application/json', ...options.headers },
        cache: 'no-store'
      });
    } catch (_) {
      throw new Error('Нет соединения с сервером. Проверьте интернет.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = data.error_code || data.code || '';
      if (code === 'user_already_exists' || /already registered/i.test(data.msg || data.message || '')) {
        throw new Error('Такой email уже зарегистрирован.');
      }
      if (code === 'invalid_credentials' || /invalid login credentials/i.test(data.msg || data.message || '')) {
        throw new Error('Неверный email или пароль.');
      }
      if (code === 'email_not_confirmed') throw new Error('Сначала подтвердите email по письму.');
      if (code === 'weak_password') throw new Error('Выберите более надёжный пароль.');
      if (code === 'email_address_invalid') throw new Error('Введите корректный email.');
      if (code === 'email_address_not_authorized') throw new Error('Для этого адреса пока не настроена отправка писем.');
      if (code === 'over_email_send_rate_limit' || response.status === 429) throw new Error('Слишком много запросов. Попробуйте позже.');
      throw new Error(response.status >= 500 ? 'Ошибка сервера. Попробуйте позже.' : 'Не удалось выполнить действие. Проверьте данные и попробуйте снова.');
    }
    return data;
  }

  async function getSession() {
    if (!session) return null;
    if ((session.expires_at || 0) * 1000 > Date.now() + 30000) return session;
    if (!refreshPromise) {
      refreshPromise = request('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: session.refresh_token })
      }).then(data => {
        if (!data.access_token || !data.refresh_token) throw new Error('Сессия истекла.');
        save({ ...data, expires_at: Math.floor(Date.now() / 1000) + data.expires_in });
        return session;
      }).catch(() => { save(null); return null; }).finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  }

  async function signUp({ name, email, password }) {
    const data = await request('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, data: { name } })
    });
    if (data.access_token && data.refresh_token) {
      save({ ...data, expires_at: Math.floor(Date.now() / 1000) + data.expires_in });
    }
    return data;
  }

  async function signIn({ email, password }) {
    const data = await request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    save({ ...data, expires_at: Math.floor(Date.now() / 1000) + data.expires_in });
    return data;
  }

  async function signOut() {
    const token = session?.access_token;
    save(null);
    if (token) {
      try { await request('/auth/v1/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); }
      catch (_) {}
    }
  }

  async function getProfile() {
    const active = await getSession();
    if (!active) return null;
    const response = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(active.user.id)}&select=id,name,email,created_at&limit=1`, {
      headers: { Authorization: `Bearer ${active.access_token}` }
    });
    return response[0] || null;
  }

  async function getMyCards() {
    const active = await getSession();
    if (!active) return [];
    let response;
    try {
      response = await fetch('/api/my-cards', {
        headers: { Authorization: `Bearer ${active.access_token}` },
        cache: 'no-store'
      });
    } catch (_) { throw new Error('Нет соединения с сервером. Проверьте интернет.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не удалось загрузить карточки.');
    return data.cards;
  }

  function mountAccountMenus() {
    document.querySelectorAll('[data-account-link]').forEach(link => {
      if (link.closest('.account-control')) return;
      const control = document.createElement('div');
      control.className = 'account-control';
      link.before(control);
      control.append(link);

      const details = document.createElement('details');
      details.className = 'account-menu';
      details.hidden = true;
      const summary = document.createElement('summary');
      summary.className = 'header-account';
      const dropdown = document.createElement('div');
      dropdown.className = 'account-dropdown';
      const profile = document.createElement('a');
      profile.href = 'dashboard.html';
      profile.textContent = 'Личный кабинет';
      const editor = document.createElement('a');
      editor.href = 'editor.html';
      editor.textContent = 'Создать карточку';
      const logout = document.createElement('button');
      logout.type = 'button';
      logout.textContent = 'Выйти';
      logout.addEventListener('click', async () => {
        logout.disabled = true;
        await signOut();
        location.assign('auth.html');
      });
      dropdown.append(profile, editor, logout);
      details.append(summary, dropdown);
      control.append(details);
    });
  }

  function updateAccountLinks() {
    mountAccountMenus();
    document.querySelectorAll('[data-account-link]').forEach(link => {
      const user = session?.user;
      const details = link.closest('.account-control').querySelector('.account-menu');
      link.hidden = Boolean(user);
      link.textContent = 'Войти';
      link.href = 'auth.html';
      details.hidden = !user;
      if (user) {
        const name = user.user_metadata?.name?.trim() || 'Профиль';
        const summary = details.querySelector('summary');
        summary.textContent = name;
        summary.title = name;
      } else {
        details.open = false;
      }
    });
  }
  document.addEventListener('DOMContentLoaded', updateAccountLinks);
  document.addEventListener('satucard:authchange', updateAccountLinks);
  document.addEventListener('click', event => {
    if (!event.target.closest('.account-control')) {
      document.querySelectorAll('.account-menu[open]').forEach(menu => { menu.open = false; });
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.account-menu[open]').forEach(menu => {
        menu.open = false;
        menu.querySelector('summary').focus();
      });
    }
  });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey) return;
    try { session = event.newValue ? JSON.parse(event.newValue) : null; }
    catch (_) { session = null; }
    document.dispatchEvent(new CustomEvent('satucard:authchange', { detail: { user: session?.user || null } }));
  });
  getSession().then(updateAccountLinks);

  return { getSession, signUp, signIn, signOut, getProfile, getMyCards };
})();
