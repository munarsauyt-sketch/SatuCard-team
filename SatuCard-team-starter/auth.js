'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const auth = window.SATUCARD_AUTH, $ = id => document.getElementById(id);
  const form = $('auth-form'), notice = $('auth-notice'), google = $('auth-google');
  const codeForm = $('email-code-form');
  let mode = new URLSearchParams(location.search).get('mode') === 'signup' ? 'signup' : 'login';
  let busy = false, codeEmail = '', codeSignup = false, resendAfter = 0;
  const googleLabel = () => mode === 'signup' ? 'Зарегистрироваться с Google' : 'Войти с Google';
  const show = (message, type = 'error') => { notice.textContent = message; notice.className = `auth-notice ${type}`; };
  function setBusy(value) {
    busy = value;
    $('auth-card-content').setAttribute('aria-busy', String(value));
    $('auth-card-content').querySelectorAll('input, button').forEach(control => { control.disabled = value; });
  }
  function setMode(next) {
    if (busy) return;
    mode = next; form.reset(); show(''); codeForm.hidden = true; $('auth-main-options').hidden = false;
    $('auth-confirm-field').hidden = next !== 'signup';
    $('email-code-login').hidden = next !== 'login';
    $('auth-title').textContent = next === 'signup' ? 'Создайте аккаунт' : 'С возвращением';
    $('auth-subtitle').textContent = next === 'signup'
      ? 'Подтвердите email, затем заполните профиль. Или начните с Google.'
      : 'Войдите в существующий профиль. Ещё нет профиля? Откройте «Регистрация».';
    $('auth-submit').textContent = next === 'signup' ? 'Зарегистрироваться' : 'Войти в SatuCard';
    $('auth-password').autocomplete = next === 'signup' ? 'new-password' : 'current-password';
    google.querySelector('span').textContent = googleLabel();
    $('auth-google-note').textContent = next === 'signup'
      ? 'После Google вы сами укажете имя и фамилию. Если профиль уже оформлен, откроется он.'
      : 'Google подтверждает вашу почту. Новый профиль потребует завершения регистрации.';
    document.querySelectorAll('[data-auth-mode]').forEach(button => {
      const active = button.dataset.authMode === next;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    });
  }
  function showCode(email, signup, sent, message = '') {
    codeEmail = email; codeSignup = signup;
    $('auth-main-options').hidden = true; codeForm.hidden = false; codeForm.reset();
    $('auth-title').textContent = signup ? 'Подтвердите регистрацию' : 'Подтвердите вашу почту';
    $('auth-subtitle').textContent = message || 'Войти сможет только человек с доступом к почтовому ящику.';
    $('code-email').textContent = email;
    $('send-email-code').textContent = sent ? 'Отправить письмо повторно' : 'Получить письмо';
    if (sent) resendAfter = Date.now() + 60000;
    show(sent ? 'Если адрес подходит для этого действия, письмо отправлено. Проверьте также «Спам». Откройте ссылку или введите код из письма.' : 'Запросите письмо. Пароль от чужой регистрации не понадобится.', sent ? 'success' : 'loading');
  }
  async function enterAccount() {
    try {
      const profile = await auth.getProfile();
      location.replace(profile?.profile_completed_at ? 'dashboard.html' : 'profile.html?registration=1');
    } catch (error) {
      if (['mail_proof_required', 'email_unconfirmed'].includes(error.code)) {
        const active = await auth.getSession();
        showCode(active.user.email, false, false, error.message);
      } else { throw error; }
    }
  }
  google.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true); google.querySelector('span').textContent = 'Открываем Google…'; show('Сейчас откроется защищённая страница Google.', 'loading');
    try { await auth.signInWithGoogle({ intent: mode }); }
    catch (error) { setBusy(false); google.querySelector('span').textContent = googleLabel(); show(error.message); }
  });
  const tabs = [...document.querySelectorAll('[data-auth-mode]')];
  tabs.forEach((button, index) => {
    button.addEventListener('click', () => setMode(button.dataset.authMode));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      setMode(tabs[next].dataset.authMode); tabs[next].focus();
    });
  });
  document.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
    const input = $(button.dataset.passwordToggle), visible = input.type === 'password';
    input.type = visible ? 'text' : 'password'; button.textContent = visible ? 'Скрыть' : 'Показать'; button.setAttribute('aria-pressed', String(visible));
  }));
  const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const email = $('auth-email').value.trim().toLowerCase(), password = $('auth-password').value;
    if (!validEmail(email)) return show('Введите корректный email.');
    if (password.length < 8) return show('Пароль должен содержать минимум 8 символов.');
    if (mode === 'signup' && password !== $('auth-confirm').value) return show('Пароли не совпадают.');
    setBusy(true); show('Связываемся с сервером…', 'loading');
    try {
      if (mode === 'signup') { await auth.signUp({ email, password }); showCode(email, true, true); }
      else { await auth.signIn({ email, password }); await enterAccount(); }
    } catch (error) { show(error.message || 'Не удалось выполнить действие.'); }
    finally { setBusy(false); }
  });
  $('email-code-login').addEventListener('click', () => {
    const email = $('auth-email').value.trim().toLowerCase();
    if (!validEmail(email)) return show('Сначала укажите email, на который зарегистрирован аккаунт.');
    showCode(email, false, false);
  });
  $('send-email-code').addEventListener('click', async () => {
    if (busy) return;
    if (Date.now() < resendAfter) return show(`Повторить отправку можно через ${Math.ceil((resendAfter - Date.now()) / 1000)} сек.`, 'loading');
    setBusy(true);
    try { await auth.sendEmailCode(codeEmail, codeSignup); resendAfter = Date.now() + 60000; show('Если адрес подходит для этого действия, письмо отправлено. Проверьте входящие и «Спам».', 'success'); }
    catch (error) { show(error.message); }
    finally { setBusy(false); }
  });
  codeForm.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const token = $('email-code').value.trim();
    if (!/^\d{6,8}$/.test(token)) return show('Введите код из письма: от 6 до 8 цифр.');
    setBusy(true);
    try { await auth.verifyEmailCode({ email: codeEmail, token, signup: codeSignup }); await enterAccount(); }
    catch (error) { show(error.message); }
    finally { setBusy(false); }
  });
  $('code-back').addEventListener('click', () => setMode(mode));
  window.addEventListener('pageshow', event => {
    if (event.persisted) { setBusy(false); google.querySelector('span').textContent = googleLabel(); show('Можно повторить вход.', 'loading'); }
  });
  setMode(mode);
  try {
    if (auth.isEmailCallback()) {
      setBusy(true); show('Проверяем подтверждение почты…', 'loading'); await auth.completeEmailSignIn(); await enterAccount();
    } else if (auth.isGoogleCallback()) {
      setBusy(true); show('Завершаем вход через Google…', 'loading'); await auth.completeGoogleSignIn(); await enterAccount();
    } else if (await auth.getSession()) { await enterAccount(); }
  } catch (error) { show(error.message || 'Не удалось завершить вход.'); }
  finally { setBusy(false); }
});
