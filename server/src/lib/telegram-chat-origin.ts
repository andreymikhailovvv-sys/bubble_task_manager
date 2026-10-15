// Same-origin guard for the signed-in owner's cookie-authenticated Telegram
// POST endpoints. No cross-origin embedding or silent side effects.
export function telegramChatRequestIsSameOrigin(
  origin: string | undefined,
  host: string | undefined,
  fetchSite: string | undefined
): boolean {
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
  if (origin) {
    try {
      const parsed = new URL(origin);
      return (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        !!host && parsed.host.toLowerCase() === host.toLowerCase() &&
        !parsed.username && !parsed.password &&
        parsed.pathname === '/' && !parsed.search && !parsed.hash;
    } catch { return false; }
  }
  return fetchSite === 'same-origin';
}
