/* The marketing page is standalone: no app bundle, no network or tracking SDK. */
(function () {
  'use strict';

  function rememberWelcome() {
    try {
      window.localStorage.setItem('planirovych_welcome_seen_v1', '1');
    } catch {
      // Storage may be blocked; the ?enter=1 destination still bypasses the gate.
    }
    try {
      document.cookie = 'planirovych_welcome_seen=1; Max-Age=31536000; Path=/; SameSite=Lax' +
        (window.location.protocol === 'https:' ? '; Secure' : '');
    } catch {
      // No cookie is required for using the task manager.
    }
  }

  document.querySelectorAll('[data-enter-app]').forEach(function (link) {
    link.addEventListener('click', rememberWelcome);
  });
})();
