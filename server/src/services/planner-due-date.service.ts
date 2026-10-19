/**
 * Canonicalise unambiguous model-produced calendar dates before persisting an
 * AI task proposal. A task with a day but no time is due at the END of that
 * local day, rather than becoming overdue in the morning.
 *
 * This is format conversion, not task-intent classification: the model alone
 * decides whether to create/reschedule a task and supplies dueDate. Relative
 * dates are frozen when the proposal is prepared, not when it is approved.
 */
const weekdays: Record<string, number> = {
  воскресенье: 0, понедельник: 1, вторник: 2, среда: 3,
  четверг: 4, пятница: 5, суббота: 6
};

type CalendarParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function safeTimeZone(zone: string): string {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return zone; }
  catch { return 'Europe/Moscow'; }
}

function localParts(date: Date, zone: string): CalendarParts {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

function validDay(year: number, month: number, day: number): boolean {
  if (!Number.isSafeInteger(year) || year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
}

function asUtc(local: CalendarParts, zone: string): string | null {
  if (!validDay(local.year, local.month, local.day) ||
      !Number.isSafeInteger(local.hour) || local.hour < 0 || local.hour > 23 ||
      !Number.isSafeInteger(local.minute) || local.minute < 0 || local.minute > 59 ||
      !Number.isSafeInteger(local.second) || local.second < 0 || local.second > 59) return null;
  const requested = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  let guess = requested;
  for (let i = 0; i < 5; i++) {
    const current = localParts(new Date(guess), zone);
    const actual = Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute, current.second);
    if (actual === requested) return new Date(guess).toISOString();
    guess += requested - actual;
  }
  // E.g. a non-existent local hour during DST change. Never silently roll over.
  return null;
}

function localDatePlusDays(local: CalendarParts, increment: number): CalendarParts {
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day + increment));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1,
    day: date.getUTCDate(), hour: 23, minute: 59, second: 0 };
}

/**
 * Returns an ISO UTC timestamp when the input is unambiguous. Returns the
 * ORIGINAL value when it cannot be safely interpreted, allowing existing
 * validation to reject it instead of guessing a deadline.
 */
export function normalizePlannerDueDate(value: string | null, userTimeZone: string, now: Date = new Date()): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') return value;
  const raw = value.trim();
  if (!raw) return value;
  const zone = safeTimeZone(userTimeZone);
  // Explicit offset wins over user zone; reject impossible dates instead
  // of accepting JS Date's calendar rollover.
  const exact = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/i);
  if (exact) {
    const [, y, m, d, h, min, sec = '0', offset] = exact;
    if (!validDay(+y, +m, +d) || +h > 23 || +min > 59 || +sec > 59) return value;
    if (offset.toUpperCase() !== 'Z') {
      const [oh, om] = offset.slice(1).split(':').map(Number);
      if (oh > 14 || om > 59 || (oh === 14 && om !== 0)) return value;
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  const dateTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dateTime) {
    const [, y, m, d, hour, minute, second] = dateTime;
    return asUtc({ year: +y, month: +m, day: +d,
      hour: hour === undefined ? 23 : +hour, minute: minute === undefined ? 59 : +minute,
      second: second === undefined ? 0 : +second }, zone) ?? value;
  }
  const localNow = localParts(now, zone);
  const normalizedWords = raw.toLowerCase().replace(/[.!?]+$/, '').trim();
  const relative = normalizedWords.match(/^(сегодня|завтра|послезавтра)(?:\s+(?:в\s+)?(\d{1,2}):(\d{2}))?$/);
  if (relative) {
    const delta = relative[1] === 'сегодня' ? 0 : relative[1] === 'завтра' ? 1 : 2;
    const local = localDatePlusDays(localNow, delta);
    if (relative[2] !== undefined) { local.hour = +relative[2]; local.minute = +relative[3]; }
    return asUtc(local, zone) ?? value;
  }
  const weekday = normalizedWords.match(/^(?:(?:на|в|во)\s+)?(?:(?:ближайший|следующий)\s+)?(понедельник|вторник|среда|четверг|пятница|суббота|воскресенье)(?:\s+(?:в\s+)?(\d{1,2}):(\d{2}))?$/);
  if (weekday) {
    const todayDay = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day)).getUTCDay();
    let delta = (weekdays[weekday[1]] - todayDay + 7) % 7;
    if (delta === 0 && normalizedWords.includes('следующий')) delta = 7;
    let local = localDatePlusDays(localNow, delta);
    if (weekday[2] !== undefined) { local.hour = +weekday[2]; local.minute = +weekday[3]; }
    let result = asUtc(local, zone);
    if (result && new Date(result).getTime() <= now.getTime()) {
      local = localDatePlusDays(localNow, delta + 7);
      if (weekday[2] !== undefined) { local.hour = +weekday[2]; local.minute = +weekday[3]; }
      result = asUtc(local, zone);
    }
    return result ?? value;
  }
  return value;
}
