/**
 * Prefix application console events with a human-readable local timestamp.
 * Timeweb can omit timestamps in downloaded output, so each message carries
 * its own clock. Keeps console's native argument formatting and error stacks.
 *
 * LOG_TIME_ZONE is optional; the default makes server diagnostics consistent
 * with the service's Moscow-based scheduling defaults, regardless of host TZ.
 */
const selectedZone = process.env.LOG_TIME_ZONE?.trim() || 'Europe/Moscow';
let timeZone = selectedZone;
let formatter: Intl.DateTimeFormat;
try {
  formatter = new Intl.DateTimeFormat('ru-RU', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
} catch {
  timeZone = 'UTC';
  formatter = new Intl.DateTimeFormat('ru-RU', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
}

export function formatServerLogTimestamp(date: Date = new Date()): string {
  const stamp = formatter.format(date).replace(/,\s*/, ' ');
  return `[${stamp}.${String(date.getMilliseconds()).padStart(3, '0')} ${timeZone === 'Europe/Moscow' ? 'МСК' : timeZone}]`;
}

// Install once before the rest of the application loads. This covers logs
// from API handlers, workers and background jobs without editing call sites.
for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => original(formatServerLogTimestamp(), ...args);
}
