'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const auth = window.SATUCARD_AUTH, $ = id => document.getElementById(id);
  const form = $('profile-form'), notice = $('profile-notice');
  let busy = false;
  const show = (message, type = 'error') => { notice.textContent = message; notice.className = `auth-notice ${type}`; };
  const enable = value => form.querySelectorAll('input, button').forEach(control => { control.disabled = !value; });
  $('setup-logout').addEventListener('click', async () => { await auth.signOut(); location.replace('auth.html'); });
  const session = await auth.getSession();
  if (!session) { location.replace('auth.html?mode=signup'); return; }
  try {
    const profile = await auth.getProfile();
    $('setup-email').textContent = session.user.email;
    if (profile.profile_completed_at) {
      $('first-name').value = profile.first_name || '';
      $('last-name').value = profile.last_name || '';
      $('profile-setup-title').textContent = 'Как к вам обращаться?';
      $('profile-setup-description').textContent = 'Измените имя и фамилию в SatuCard. Данные вашего Google-аккаунта от этого не изменятся.';
      $('save-profile').textContent = 'Сохранить профиль';
    }
    // An incomplete profile always starts blank. Only the user chooses the name.
    show('', 'loading'); enable(true); $('first-name').focus();
  } catch (error) {
    if (['sign_in_required', 'mail_proof_required', 'email_unconfirmed'].includes(error.code)) { location.replace('auth.html?verify=1'); return; }
    show(error.message || 'Не удалось загрузить профиль. Обновите страницу.');
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const firstName = $('first-name').value.trim(), lastName = $('last-name').value.trim();
    if (!firstName || !lastName) return show('Заполните имя и фамилию.');
    busy = true; enable(false); form.setAttribute('aria-busy', 'true'); show('Сохраняем профиль…', 'loading');
    try { await auth.saveProfile(firstName, lastName); location.replace('dashboard.html'); }
    catch (error) { show(error.message || 'Не удалось сохранить профиль.'); enable(true); }
    finally { busy = false; form.setAttribute('aria-busy', 'false'); }
  });
});
