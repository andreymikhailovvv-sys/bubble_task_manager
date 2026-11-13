/**
 * Same-origin cross-tab signal for an email-confirmed account.
 * No personal data or bearer credentials are ever broadcast or persisted.
 */
const CHANNEL = 'planirovych:account-email-verified';
const STORAGE_SIGNAL = 'btm:account-email-verification-signal';

export function announceAccountEmailVerified(): void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ type: 'email-verified' });
    channel.close();
  } catch { /* Unsupported browser: storage/focus fallback below. */ }
  try { localStorage.setItem(STORAGE_SIGNAL, String(Date.now())); }
  catch { /* localStorage can be unavailable in restrictive browsers. */ }
}

export function subscribeAccountEmailVerified(onSignal: () => void): () => void {
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => {
      if (event.data?.type === 'email-verified') onSignal();
    };
  } catch { /* Browser without BroadcastChannel still supports focus checks. */ }

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_SIGNAL) onSignal();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('storage', onStorage);
    channel?.close();
  };
}
