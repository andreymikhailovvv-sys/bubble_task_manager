import jwt from 'jsonwebtoken';

export const CALENDAR_EXPORT_PURPOSE = 'calendar-ics-export' as const;
export const CALENDAR_EXPORT_TTL_SECONDS = 5 * 60;
export const CALENDAR_DURATION_OPTIONS = [30, 60, 90, 120] as const;
export const CALENDAR_REMINDER_OPTIONS = [10, 30, 60] as const;

export type CalendarExportOptions = {
  startAt: string;
  durationMinutes: number;
  reminderMinutes: number | null;
};

export type CalendarExportToken = CalendarExportOptions & {
  taskId: string;
  userId: string;
  purpose: typeof CALENDAR_EXPORT_PURPOSE;
};

export type CalendarTask = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  location: string | null;
};

const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required for calendar export');
  return secret;
};

export function parseCalendarExportOptions(value: unknown): CalendarExportOptions | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  if (typeof body.startAt !== 'string' || !ISO_INSTANT_PATTERN.test(body.startAt)) return null;
  const parsedStart = new Date(body.startAt);
  if (Number.isNaN(parsedStart.getTime())) return null;
  if (!CALENDAR_DURATION_OPTIONS.includes(body.durationMinutes as never)) return null;
  if (body.reminderMinutes !== null && !CALENDAR_REMINDER_OPTIONS.includes(body.reminderMinutes as never)) return null;
  return {
    startAt: parsedStart.toISOString(),
    durationMinutes: body.durationMinutes as number,
    reminderMinutes: body.reminderMinutes as number | null
  };
}

export function signCalendarExportToken(payload: Omit<CalendarExportToken, 'purpose'>): string {
  return jwt.sign({ ...payload, purpose: CALENDAR_EXPORT_PURPOSE }, getJwtSecret(), {
    expiresIn: CALENDAR_EXPORT_TTL_SECONDS
  });
}

export function verifyCalendarExportToken(token: string): CalendarExportToken {
  const decoded = jwt.verify(token, getJwtSecret()) as Partial<CalendarExportToken> & { exp?: number };
  const options = parseCalendarExportOptions(decoded);
  if (
    decoded.purpose !== CALENDAR_EXPORT_PURPOSE
    || typeof decoded.taskId !== 'string'
    || typeof decoded.userId !== 'string'
    || !options
  ) {
    throw new Error('Invalid calendar export token');
  }
  return { taskId: decoded.taskId, userId: decoded.userId, purpose: decoded.purpose, ...options };
}

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

const formatIcsUtc = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export function createTaskIcs(task: CalendarTask, options: CalendarExportOptions, now = new Date()): string {
  const start = new Date(options.startAt);
  const end = new Date(start.getTime() + options.durationMinutes * 60_000);
  const uidTimestamp = start.toISOString().replace(/\D/g, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Planirovych//Calendar Export//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:planirovych-task-${escapeIcsText(task.id)}-${uidTimestamp}@planirovych.ru`,
    `DTSTAMP:${formatIcsUtc(now)}`,
    `DTSTART:${formatIcsUtc(start)}`,
    `DTEND:${formatIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(task.title.trim() || 'Задача Планировыча')}`
  ];
  if (task.description?.trim()) lines.push(`DESCRIPTION:${escapeIcsText(task.description)}`);
  if (task.location?.trim()) lines.push(`LOCATION:${escapeIcsText(task.location)}`);
  if (options.reminderMinutes !== null) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER:-PT${options.reminderMinutes}M`,
      'DESCRIPTION:Напоминание',
      'END:VALARM'
    );
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
