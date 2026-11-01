/**
 * Web-only best effort for iOS Telegram WebViews. Capturing a microphone makes
 * an automatic audio session "play-and-record", which can route playback to
 * the handset earpiece. On supporting WebKit builds, the explicit "playback"
 * category requests the media output instead.
 *
 * This does NOT change Android's AudioManager routing: Android WebView has no
 * standardized JS API for selecting the speaker while capture is active.
 */
export type LiveVoiceAudioSession = { type: string };

export function requestLiveVoiceMediaSession({
  session, userAgent, telegram
}: {
  session?: LiveVoiceAudioSession | null;
  userAgent: string;
  telegram: boolean;
}): () => void {
  if (!telegram || !/iPhone|iPad|iPod/i.test(userAgent) || !session) return () => {};
  let originalType: string;
  try {
    originalType = session.type;
    session.type = 'playback';
    if (session.type !== 'playback') return () => {};
  } catch {
    return () => {};
  }
  return () => {
    // Never overwrite another component's audio policy if it took ownership.
    try { if (session.type === 'playback') session.type = originalType; }
    catch { /* The WebView owns audio policy; restoration is best-effort. */ }
  };
}

export function preferTelegramLiveVoiceMediaSession(): () => void {
  const browser = navigator as Navigator & { audioSession?: LiveVoiceAudioSession };
  const telegramWindow = window as Window & { Telegram?: { WebApp?: unknown } };
  return requestLiveVoiceMediaSession({
    session: browser.audioSession,
    userAgent: navigator.userAgent,
    telegram: Boolean(telegramWindow.Telegram?.WebApp) || /Telegram/i.test(navigator.userAgent)
  });
}
