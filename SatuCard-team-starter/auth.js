'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const auth = window.SATUCARD_AUTH;
  const form = document.querySelector('#auth-form');
  const notice = document.querySelector('#auth-notice');
  const submit = document.querySelector('#auth-submit');
  const title = document.querySelector('#auth-title');
  const subtitle = document.querySelector('#auth-subtitle');
  const nameField = document.querySelector('#auth-name-field');
  const confirmField = document.querySelector('#auth-confirm-field');
  const password = document.querySelector('#auth-password');
  const email = document.querySelector('#auth-email');
  const googleButton = document.querySelector('#auth-google');
  let busy = false;
  let mode = new URLSearchParams(location.search).get('mode') === 'signup' ? 'signup' : 'login';

  function setMode(next) {
    if (busy) return;
    mode = next;
    form.reset();
    notice.textContent = '';
    notice.className = 'auth-notice';
    nameField.hidden = next !== 'signup';
    confirmField.hidden = next !== 'signup';
    title.textContent = next === 'signup' ? 'Создайте аккаунт' : 'С возвращением';
    subtitle.textContent = next === 'signup'
      ? 'Ваши опубликованные карточки будут в одном месте.'
      : 'Войдите, чтобы продолжить работу с карточками.';
    submit.textContent = next === 'signup' ? 'Зарегистрироваться' : 'Войти в SatuCard';
    document.querySelectorAll('[data-auth-mode]').forEach(button => {
      const selected = button.dataset.authMode === next;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    password.autocomplete = next === 'signup' ? 'new-password' : 'current-password';
  }

  function show(message, type = 'error') {
    notice.textContent = message;
    notice.className = `auth-notice ${type}`;
  }

  function setBusy(value) {
    busy = value;
    form.setAttribute('aria-busy', String(value));
    form.querySelectorAll('input, button').forEach(control => { control.disabled = value; });
    googleButton.disabled = value;
    document.querySelectorAll('[data-auth-mode]').forEach(button => { button.disabled = value; });
  }

  googleButton.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    googleButton.querySelector('span').textContent = 'Открываем Google…';
    show('Сейчас откроется защищённая страница Google.', 'loading');
    try { await auth.signInWithGoogle(); }
    catch (error) {
      show(error.message || 'Не удалось открыть Google. Попробуйте ещё раз.');
      setBusy(false);
      googleButton.querySelector('span').textContent = 'Продолжить с Google';
    }
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    setBusy(false);
    googleButton.querySelector('span').textContent = 'Продолжить с Google';
    show('Вы вернулись со страницы входа. Можно повторить попытку или использовать email.', 'loading');
  });

  const tabs = [...document.querySelectorAll('[data-auth-mode]')];
  tabs.forEach((button, index) => {
    button.addEventListener('click', () => setMode(button.dataset.authMode));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      setMode(tabs[next].dataset.authMode);
      tabs[next].focus();
    });
  });
  document.querySelectorAll('[data-password-toggle]').forEach(button =>
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      input.type = input.type === 'password' ? 'text' : 'password';
      button.textContent = input.type === 'password' ? 'Показать' : 'Скрыть';
      button.setAttribute('aria-pressed', String(input.type === 'text'));
    })
  );

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const name = document.querySelector('#auth-name').value.trim();
    const address = email.value.trim().toLowerCase();
    const pass = password.value;
    const confirm = document.querySelector('#auth-confirm').value;
    if (mode === 'signup' && (!name || name.length > 80)) return show('Укажите имя длиной до 80 символов.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return show('Введите корректный email.');
    if (pass.length < 8) return show('Пароль должен содержать минимум 8 символов.');
    if (mode === 'signup' && pass !== confirm) return show('Пароли не совпадают.');
    setBusy(true);
    submit.textContent = mode === 'signup' ? 'Создаём аккаунт…' : 'Входим…';
    show('Связываемся с сервером…', 'loading');
    try {
      if (mode === 'signup') {
        const data = await auth.signUp({ name, email: address, password: pass });
        if (!data.access_token) {
          show('Регистрация отправлена. Подтвердите email по письму, затем войдите.', 'success');
          form.reset();
          return;
        }
      } else {
        await auth.signIn({ email: address, password: pass });
      }
      show('Успешно! Открываем ваш профиль…', 'success');
      location.assign('dashboard.html');
    } catch (error) {
      show(error.message || 'Ошибка сервера. Попробуйте позже.');
    } finally {
      setBusy(false);
      submit.textContent = mode === 'signup' ? 'Зарегистрироваться' : 'Войти в SatuCard';
    }
  });

  setMode(mode);
  if (auth.isGoogleCallback()) {
    setBusy(true);
    show('Завершаем вход через Google…', 'loading');
    try {
      await auth.completeGoogleSignIn();
      show('Вход выполнен. Открываем личный кабинет…', 'success');
      location.replace('dashboard.html');
    } catch (error) {
      show(error.message || 'Не удалось завершить вход через Google.');
      setBusy(false);
      googleButton.focus();
    }
    return;
  }
  if (new URLSearchParams(location.search).has('confirmed')) {
    show('Email подтверждён. Войдите в аккаунт.', 'success');
  }
  auth.getSession().then(active => {
    if (active) location.replace('dashboard.html');
  });
});
