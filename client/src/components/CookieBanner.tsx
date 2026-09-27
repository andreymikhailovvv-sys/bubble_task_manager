import { useState } from 'react';

export const COOKIE_CONSENT_STORAGE_KEY = 'planirovych_cookie_consent';
export const COOKIE_CONSENT_VERSION = 'v1';

function hasCookieConsent() {
  try {
    return window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY) === COOKIE_CONSENT_VERSION;
  } catch {
    return false;
  }
}

export default function CookieBanner() {
  const [isVisible, setIsVisible] = useState(() => !hasCookieConsent());

  if (!isVisible) return null;

  const acceptCookies = () => {
    try {
      window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, COOKIE_CONSENT_VERSION);
    } catch {
      // Баннер всё равно можно закрыть, если браузер запретил локальное хранилище.
    }
    setIsVisible(false);
  };

  return (
    <aside className="cookie-banner" aria-label="Уведомление об использовании cookies">
      <p>
        Планировыч использует cookies для авторизации, безопасности и корректной работы сервиса.{' '}
        <a href="/legal/cookies">Подробнее</a>
      </p>
      <button type="button" onClick={acceptCookies}>Принять</button>
    </aside>
  );
}
