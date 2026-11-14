'use strict';

// Publishable keys identify the browser application; RLS protects user data.
// The Supabase secret key is used only by server functions.
window.SATUCARD_AUTH = (() => {
  const base = 'https://pnnaqvfcswdroldovbty.supabase.co';
  const key = 'sb_publishable_aGyscvYLYpZsyn3eG1c3mQ_I_W_pOBL';
  const storageKey = 'satucard-session-v1';
  const googleFlowKey = 'satucard-google-pkce-v1';
  const googleFlowLifetime = 10 * 60 * 1000;
  const emailFlowKey = 'satucard-email-billing-v1';
  const accountQuery = new URLSearchParams(location.search);
  const accountPlans = new Set(['basic', 'plus', 'max', 'max3', 'niche10']);
  let accountContext = {
    plan: accountQuery.get('plan'),
    billing: accountQuery.get('billing') === '1' || location.hash === '#billing-title'
  };
  let callbackTheme;
  let session = null;
  let refreshPromise = null;
  let googleSignInPending = false;
  let googleCallbackPromise = null;
  let completedIntent = 'login';
  let currentProfile = null;

  function accountTheme() {
    return document.documentElement?.dataset.theme || callbackTheme || accountQuery.get('theme');
  }

  function accountPage(page, params = {}, keepBilling = true) {
    const url = new URL(page, location.href);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const theme = accountTheme();
    if (theme === 'light' || theme === 'dark') url.searchParams.set('theme', theme);
    if (keepBilling && (accountContext.billing || accountPlans.has(accountContext.plan))) {
      if (accountPlans.has(accountContext.plan)) url.searchParams.set('plan', accountContext.plan);
      if (page === 'dashboard.html') url.hash = 'billing-title';
      else url.searchParams.set('billing', '1');
    }
    return url.href;
  }

  function restoreAccountContext(context) {
    if (!context) return;
    accountContext = { plan: context.plan, billing: context.billing === true };
    if (context.theme !== 'light' && context.theme !== 'dark') return;
    callbackTheme = context.theme;
    if (document.documentElement) document.documentElement.dataset.theme = callbackTheme;
  }

  function rememberEmailBilling() {
    if (!accountContext.billing && !accountPlans.has(accountContext.plan)) return;
    try {
      const flow = JSON.stringify({
        ...accountContext, theme: accountTheme(), createdAt: Date.now()
      });
      sessionStorage.setItem(emailFlowKey, flow);
      localStorage.setItem(emailFlowKey, flow);
    } catch (_) { /* Email still works when storage is unavailable. */ }
  }

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved?.access_token && saved?.refresh_token && saved?.user?.id) session = saved;
  } catch (_) {
    // Browsers may disable local storage for local files or private sessions.
  }

  function save(value) {
    if (session?.user?.id !== value?.user?.id) currentProfile = null;
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
      const unavailable = new Error(error.name === 'AbortError' ? 'Сервер долго не отвечает. Повторите попытку.' : 'Нет соединения с сервером. Проверьте интернет.');
      unavailable.transient = true;
      throw unavailable;
    } finally {
      clearTimeout(timeout);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = data.error_code || data.code || '';
      if (response.status >= 500 || response.status === 429) {
        const temporary = new Error('Сервис входа временно недоступен. Повторите попытку.');
        temporary.transient = true;
        throw temporary;
      }
      const errorText = `${data.msg || ''} ${data.message || ''} ${data.error_description || ''}`;
      if (errorText.includes('MAILBOX_PROOF_REQUIRED')) throw new Error('Старый аккаунт требует подтверждения почты. Войдите через Google или по коду из письма.');
      if (errorText.includes('EMAIL_CONFIRMATION_REQUIRED')) throw new Error('Сначала подтвердите email по письму или войдите через Google.');
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
      if (code === 'otp_expired') throw new Error('Код или ссылка устарели. Запросите новое письмо.');
      if (code === 'otp_disabled' || code === 'signup_disabled') throw new Error('Если аккаунт уже создан, попробуйте Google или запросите письмо позже. Для нового аккаунта откройте «Регистрация».');
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
      }).catch(error => {
        // Keep refresh credentials after a network failure, but never send an expired access token.
        if (!error.transient) save(null);
        return null;
      }).finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  }

  async function signUp({ email, password }) {
    const settings = await request('/auth/v1/settings');
    if (settings.mailer_autoconfirm !== false) throw new Error('Регистрация по email временно недоступна: подтверждение почты не настроено. Используйте Google.');
    const data = await request('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    // A sign-up response never signs the user in without proof of the mailbox.
    if (data.access_token) throw new Error('Сервер выдал сессию без проверки почты. Вход остановлен. Используйте Google.');
    rememberEmailBilling();
    return data;
  }

  function saveAuthResponse(data) {
    if (!data.access_token || !data.refresh_token || !data.user?.id || !data.user.email_confirmed_at || !(Number(data.expires_in) > 0)) {
      throw new Error('Почта не подтверждена. Проверьте письмо или войдите через Google.');
    }
    save({ access_token: data.access_token, refresh_token: data.refresh_token, token_type: data.token_type || 'bearer',
      expires_in: Number(data.expires_in), expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in), user: data.user });
    return data;
  }

  async function signIn({ email, password }) {
    const data = await request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    saveAuthResponse(data);
    return data;
  }

  async function sendEmailCode(email, signup = false) {
    const data = await request(signup ? '/auth/v1/resend' : '/auth/v1/otp', { method: 'POST',
      body: JSON.stringify(signup ? { email, type: 'signup' } : { email, create_user: false }) });
    rememberEmailBilling();
    return data;
  }

  async function verifyEmailCode({ email, token, signup = false }) {
    return saveAuthResponse(await request('/auth/v1/verify', { method: 'POST',
      body: JSON.stringify({ email, token, type: signup ? 'signup' : 'email' }) }));
  }

  function isEmailCallback() { return new URLSearchParams(location.search).has('token_hash'); }
  async function completeEmailSignIn() {
    const query = new URLSearchParams(location.search), token = query.get('token_hash'), type = query.get('type');
    history.replaceState(null, '', location.pathname);
    if (!/^[A-Za-z0-9_-]{20,256}$/.test(token || '') || !['signup', 'email', 'magiclink', 'recovery'].includes(type)) {
      throw new Error('Некорректная ссылка подтверждения. Запросите новое письмо.');
    }
    const data = saveAuthResponse(await request('/auth/v1/verify', { method: 'POST', body: JSON.stringify({ token_hash: token, type }) }));
    try {
      const context = JSON.parse(sessionStorage.getItem(emailFlowKey) || localStorage.getItem(emailFlowKey) || 'null');
      sessionStorage.removeItem(emailFlowKey);
      localStorage.removeItem(emailFlowKey);
      const age = Date.now() - context?.createdAt;
      if (age >= 0 && age < 60 * 60 * 1000 && !accountContext.billing && !accountPlans.has(accountContext.plan)) {
        restoreAccountContext(context);
      }
    } catch (_) { /* Email still works when storage is unavailable. */ }
    return data;
  }

  function isGoogleCallback() {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.slice(1));
    return query.has('code') || query.has('error') || query.has('error_code') || hash.has('error') || hash.has('access_token') || hash.has('refresh_token');
  }

  async function signInWithGoogle({ intent = 'login' } = {}) {
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
        sessionStorage.setItem(googleFlowKey, JSON.stringify({
          verifier, createdAt: Date.now(), callback: callback.href,
          intent: intent === 'signup' ? 'signup' : 'login',
          context: { ...accountContext, theme: accountTheme() }
        }));
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
      completedIntent = flow.intent === 'signup' ? 'signup' : 'login';
      restoreAccountContext(flow.context);
      const data = await request('/auth/v1/token?grant_type=pkce', {
        method: 'POST', body: JSON.stringify({ auth_code: code, code_verifier: flow.verifier })
      });
      if (!data.access_token || !data.refresh_token || !data.user?.id || !data.user.email_confirmed_at || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) <= 0) {
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
    const data = await accountRequest('/api/profile');
    if (session?.user?.id === active.user.id) {
      currentProfile = data.profile;
      updateAccountLinks();
    }
    return data.profile;
  }

  async function accountRequest(path, options = {}) {
    const active = await getSession();
    if (!active) throw Object.assign(new Error('Войдите в аккаунт.'), { code: 'sign_in_required' });
    let response;
    try { response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', Authorization: `Bearer ${active.access_token}` }, cache: 'no-store' }); }
    catch { throw new Error('Нет соединения с сервером. Проверьте интернет.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'Не удалось выполнить действие.'), { code: data.code, status: response.status });
    return data;
  }

  async function saveProfile(firstName, lastName) {
    const data = await accountRequest('/api/profile', { method: 'POST', body: JSON.stringify({ firstName, lastName }) });
    currentProfile = data.profile;
    updateAccountLinks();
    return data.profile;
  }

  async function getMyCardsPage(offset = 0) {
    const active = await getSession();
    if (!active) return { cards: [], nextOffset: null };
    let response;
    const url = offset > 0 ? `/api/my-cards?offset=${encodeURIComponent(String(offset))}` : '/api/my-cards';
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${active.access_token}` },
        cache: 'no-store'
      });
    } catch (_) { throw new Error('Нет соединения с сервером. Проверьте интернет.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не удалось загрузить карточки.');
    return { cards: Array.isArray(data.cards) ? data.cards : [], nextOffset: data.nextOffset ?? null };
  }

  async function getMyCards() {
    const page = await getMyCardsPage(0);
    return page.cards;
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
      profile.href = accountPage('dashboard.html', {}, false);
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
        location.assign(accountPage('auth.html', {}, false));
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
      link.href = accountPage('auth.html', {}, false);
      details.hidden = !user;
      if (user) {
        const name = currentProfile?.id === user.id && currentProfile.profile_completed_at ? currentProfile.name : 'Профиль';
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
  getSession().then(active => { updateAccountLinks(); if (active && document.querySelectorAll('[data-account-link]').length) getProfile().catch(() => {}); });

  function editorReturn() {
    if (accountContext.billing || accountPlans.has(accountContext.plan)) return null;
    try {
      const value = sessionStorage.getItem('satucard-editor-return') || localStorage.getItem('satucard-editor-return');
      if (!value) return null;
      const flow = JSON.parse(value);
      sessionStorage.removeItem('satucard-editor-return');
      localStorage.removeItem('satucard-editor-return');
      const age = Date.now() - flow.createdAt;
      if (!(age >= 0 && age < 3600000)) return null;
      const url = new URL(flow.path, location.origin);
      if (url.origin !== location.origin || url.pathname !== '/editor.html') return null;
      return url.href;
    } catch (_) { return null; }
  }
  return { editorReturn, getSession, signUp, signIn, sendEmailCode, verifyEmailCode, isEmailCallback, completeEmailSignIn,
    signInWithGoogle, isGoogleCallback, completeGoogleSignIn, getAuthIntent: () => completedIntent,
    signOut, getProfile, saveProfile, getMyCards, getMyCardsPage, accountPage };
})();
