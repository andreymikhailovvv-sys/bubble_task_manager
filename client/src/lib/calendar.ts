export type CalendarExportProvider = 'google' | 'outlook' | 'ics';
export type CalendarDurationMinutes = 30 | 60 | 90 | 120;

export type CalendarUrlItem = {
  title: string;
  description?: string | null;
  location?: string | null;
};

export function truncateCalendarDescription(description?: string | null, maxLength = 1800) {
  const value = description?.trim() ?? '';
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function formatCalendarUtcDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Некорректная дата события');
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function calendarRange(startAt: string, durationMinutes: CalendarDurationMinutes) {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) throw new Error('Некорректная дата события');
  return { start, end: new Date(start.getTime() + durationMinutes * 60_000) };
}

export function buildGoogleCalendarUrl(item: CalendarUrlItem, startAt: string, durationMinutes: CalendarDurationMinutes, timeZone: string) {
  const { start, end } = calendarRange(startAt, durationMinutes);
  const url = new URL('https://calendar.google.com/calendar/r/eventedit');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', item.title);
  url.searchParams.set('dates', `${formatCalendarUtcDate(start)}/${formatCalendarUtcDate(end)}`);
  url.searchParams.set('details', truncateCalendarDescription(item.description));
  if (item.location?.trim()) url.searchParams.set('location', item.location.trim());
  url.searchParams.set('stz', timeZone);
  url.searchParams.set('etz', timeZone);
  return url.toString();
}

export function buildOutlookCalendarUrl(item: CalendarUrlItem, startAt: string, durationMinutes: CalendarDurationMinutes) {
  const { start, end } = calendarRange(startAt, durationMinutes);
  const url = new URL('https://outlook.live.com/calendar/0/deeplink/compose');
  url.searchParams.set('rru', 'addevent');
  url.searchParams.set('path', '/calendar/action/compose');
  url.searchParams.set('subject', item.title);
  url.searchParams.set('body', truncateCalendarDescription(item.description));
  if (item.location?.trim()) url.searchParams.set('location', item.location.trim());
  url.searchParams.set('startdt', start.toISOString());
  url.searchParams.set('enddt', end.toISOString());
  return url.toString();
}
