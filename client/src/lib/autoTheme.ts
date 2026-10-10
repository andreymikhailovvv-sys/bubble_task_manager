export type ThemePreference = 'light' | 'dark' | 'auto';
export type EffectiveTheme = 'light' | 'dark';

// The previous app stored 'light' on first launch, even when nobody chose it.
// Move that legacy default to 'auto' once, retaining dark/auto choices and any
// explicit selection made after this migration. Old manual light is indistinguishable
// from the previous implicit default, so it also migrates once.
export function loadThemePreference(storage: Pick<Storage, 'getItem' | 'setItem'>, key: string): ThemePreference {
  const saved = storage.getItem(key);
  const migrationKey = `${key}:auto-default-v1`;
  if (storage.getItem(migrationKey) !== '1') {
    storage.setItem(migrationKey, '1');
    if (saved === 'light' || saved === null) return 'auto';
  }
  return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto';
}

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
