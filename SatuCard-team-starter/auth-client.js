'use strict';

// Publishable keys identify the browser application; RLS protects user data.
// The Supabase secret key is used only by server functions.
window.SATUCARD_AUTH = (() => {
  const base = 'https://pnnaqvfcswdroldovbty.supabase.co';
  const key = 'sb_publishable_aGyscvYLYpZsyn3eG1c3mQ_I_W_pOBL';
  const storageKey = 'satucard-session-v1';
  const googleFlowKey = 'satucard-google-pkce-v1';
  const googleFlowLifetime = 10 * 60 * 1000;
  let session = null;
  let refreshPromise = null;
  let googleSignInPending = false;
  let googleCallbackPromise = null;

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      response = await fetch(`${base}${path}`, {
        ...options,
        headers: { apikey: key, 'content-type': 'application/json', ...options.headers },
        cache: 'no-store', signal: controller.signal
      });
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Сервер долго не отвечает. Повторите попытку.');
      throw new Error('Нет соединения с сервером. Проверьте интернет.');
    } finally {
      clearTimeout(timeout);
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
      if (['bad_code_verifier', 'flow_state_not_found', 'flow_state_expired', 'validation_failed'].includes(code)) {
        throw new Error('Ссылка входа устарела. Нажмите «Продолжить с Google» ещё раз.');
      }
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

  function isGoogleCallback() {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.slice(1));
    return query.has('code') || query.has('error') || query.has('error_code') || hash.has('error') || hash.has('access_token') || hash.has('refresh_token');
  }

  async function signInWithGoogle() {
    if (googleSignInPending) return;
    if (location.protocol !== 'https:' && !(location.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(location.hostname))) {
      throw new Error('Для входа через Google откройте сайт https://satucard-team.vercel.app/auth.html');
    }
    if (!window.crypto?.subtle || !window.crypto?.getRandomValues) {
      throw new Error('Браузер не поддерживает безопасный вход. Обновите его или войдите по email.');
    }
    googleSignInPending = true;
    try {
      const settings = await request('/auth/v1/settings');
      if (!settings.external?.google) {
        throw new Error('Вход через Google ещё не подключён. Пока используйте email.');
      }
      // Supabase validates Google's OAuth state. PKCE additionally binds the
      // single-use code to the browser tab that initiated this sign-in.
      const bytes = window.crypto.getRandomValues(new Uint8Array(32));
      const verifier = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
      const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const callback = new URL('auth.html', location.href);
      callback.search = '';
      callback.hash = '';
      try {
        sessionStorage.setItem(googleFlowKey, JSON.stringify({ verifier, createdAt: Date.now(), callback: callback.href }));
      } catch (_) {
        throw new Error('Разрешите хранение данных сайта в браузере, чтобы продолжить вход через Google.');
      }
      const target = new URL(`${base}/auth/v1/authorize`);
      target.search = new URLSearchParams({
        provider: 'google', redirect_to: callback.href,
        code_challenge: challenge, code_challenge_method: 's256', prompt: 'select_account'
      }).toString();
      location.assign(target.href);
    } catch (error) {
      googleSignInPending = false;
      throw error;
    }
  }

  function completeGoogleSignIn() {
    // One exchange per page even if several consumers initialise together.
    if (googleCallbackPromise) return googleCallbackPromise;
    if (!isGoogleCallback()) return Promise.resolve(false);
    googleCallbackPromise = (async () => {
      const query = new URLSearchParams(location.search);
      const fragment = new URLSearchParams(location.hash.slice(1));
      const code = query.get('code');
      const errorCode = query.get('error') || query.get('error_code') || fragment.get('error');
      // Remove OAuth parameters before a network request or navigation. Tokens
      // from an implicit-flow fragment are never accepted as a login session.
      history.replaceState(null, '', location.pathname);
      let flow;
      try {
        flow = JSON.parse(sessionStorage.getItem(googleFlowKey) || 'null');
        sessionStorage.removeItem(googleFlowKey);
      } catch (_) {
        throw new Error('Не удалось восстановить вход. Разрешите хранение данных сайта и попробуйте ещё раз.');
      }
      if (errorCode) {
        throw new Error(errorCode === 'access_denied'
          ? 'Вход через Google отменён. Можно повторить попытку или войти по email.'
          : 'Google не завершил вход. Повторите попытку или используйте email.');
      }
      const callback = new URL('auth.html', location.href).href;
      const age = Date.now() - Number(flow?.createdAt);
      if (!code || !/^[0-9a-f]{64}$/.test(flow?.verifier || '') || !Number.isFinite(age) || age < 0 || age > googleFlowLifetime || flow.callback !== callback) {
        throw new Error('Попытка входа устарела или открыта в другой вкладке. Нажмите «Продолжить с Google» ещё раз.');
      }
      const data = await request('/auth/v1/token?grant_type=pkce', {
        method: 'POST', body: JSON.stringify({ auth_code: code, code_verifier: flow.verifier })
      });
      if (!data.access_token || !data.refresh_token || !data.user?.id || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) <= 0) {
        throw new Error('Не удалось завершить вход. Попробуйте ещё раз.');
      }
      // Persist only SatuCard's Supabase session, never Google's provider tokens.
      save({ access_token: data.access_token, refresh_token: data.refresh_token,
        token_type: data.token_type || 'bearer', expires_in: Number(data.expires_in),
        expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in), user: data.user });
      return true;
    })();
    return googleCallbackPromise;
  }

  async function signOut() {
    const token = session?.access_token;
    save(null);
    try { sessionStorage.removeItem(googleFlowKey); } catch (_) {}
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
        const name = user.user_metadata?.name?.trim() || user.user_metadata?.full_name?.trim() || 'Профиль';
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
  window.addEventListener('pageshow', event => {
    if (event.persisted) googleSignInPending = false;
  });
  getSession().then(updateAccountLinks);

  return { getSession, signUp, signIn, signInWithGoogle, isGoogleCallback, completeGoogleSignIn, signOut, getProfile, getMyCards };
})();
