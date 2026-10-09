export type ThemePreference = 'light' | 'dark' | 'auto';
export type EffectiveTheme = 'light' | 'dark';

/**
 * Resolve the workspace theme using the user's configured IANA time zone.
 * Night runs from 20:00 inclusive until 05:00 exclusive in that zone.
 */
export function resolveThemeMode(preference: ThemePreference, timeZone: string, now: Date): EffectiveTheme {
  if (preference !== 'auto') return preference;
  let hour: number;
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23'
    });
    hour = Number.parseInt(formatter.format(now), 10);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return 'light';
  } catch {
    // An invalid time zone must never break the workspace.
    return 'light';
  }
  return hour >= 20 || hour < 5 ? 'dark' : 'light';
}
