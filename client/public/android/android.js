/* Standalone Android download page. No React, Telegram SDK, auth bootstrap,
   trackers or main application bundle. Static QR always points to /android. */
(() => {
  'use strict';
  const link = document.getElementById('download-link');
  const pending = document.getElementById('download-pending');
  const version = document.getElementById('release-version');
  const status = document.getElementById('release-status');
  const notes = document.getElementById('release-notes');
  const notesVersion = document.getElementById('release-notes-version');
  const notesText = document.getElementById('release-notes-text');
  const showUnavailable = message => {
    pending.textContent = 'APK временно недоступна';
    status.textContent = message;
    status.classList.add('error');
    link.hidden = true;
  };
  fetch('/api/android/latest', {
    credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' }
  }).then(response => {
    if (!response.ok) throw new Error('Сервис проверки версии временно недоступен.');
    return response.json();
  }).then(release => {
    if (!release || release.available !== true ||
        !Number.isSafeInteger(release.versionCode) || release.versionCode < 1) {
      pending.textContent = 'APK готовится к публикации';
      status.textContent = 'Подписанная версия приложения пока не опубликована.';
      return;
    }
    const name = typeof release.versionName === 'string' ?
      release.versionName.slice(0, 48) : String(release.versionCode);
    const size = Number(release.sizeBytes);
    link.hidden = false;
    pending.hidden = true;
    version.textContent = 'Версия ' + name +
      (Number.isFinite(size) && size > 0 ? ' · ' + (size / 1048576).toFixed(1) + ' МБ' : '');
    status.textContent = 'Для Android 8.0 и новее. Установка подтверждается средствами Android.';
    if (typeof release.notes === 'string' && release.notes.trim()) {
      notes.hidden = false;
      notesVersion.textContent = name;
      notesText.textContent = release.notes.slice(0, 1200);
    }
  }).catch(() => showUnavailable('Попробуйте обновить страницу чуть позже.'));
})();