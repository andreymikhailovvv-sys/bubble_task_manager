export type ManualRecurrenceSlot = { time: string; weekday?: number; monthDay?: number };
export type RecurrenceSchedule = {
  rrule?: string;
  timezone?: string;
  until?: string | null;
  slots?: ManualRecurrenceSlot[];
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_SLOTS = 31;
const validZone = (zone: string) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; }
};
const dateFields = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const field = (name: string) => Number(parts.find((part) => part.type === name)?.value ?? NaN);
  return { year: field('year'), month: field('month'), day: field('day'),
    hour: field('hour'), minute: field('minute'), second: field('second') };
};
function toZonedInstant(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date | null {
  const utc = Date.UTC(year, month - 1, day, hour, minute);
  let instant = utc;
  for (let i = 0; i < 3; i += 1) {
    const local = dateFields(new Date(instant), timezone);
    const shift = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - instant;
    const next = utc - shift;
    if (next === instant) break;
    instant = next;
  }
  const actual = dateFields(new Date(instant), timezone);
  // A local time that never exists during DST transition is not a valid slot.
  if ([actual.year, actual.month, actual.day, actual.hour, actual.minute].join('/') !==
    [year, month, day, hour, minute].join('/')) return null;
  return new Date(instant);
}
export function validateManualRecurrenceSchedule(schedule: RecurrenceSchedule): { freq: 'DAILY' | 'WEEKLY' | 'MONTHLY'; zone: string; slots: ManualRecurrenceSlot[] } {
  const freq = /^FREQ=(DAILY|WEEKLY|MONTHLY)(?:;|$)/i.exec(schedule.rrule ?? '')?.[1]?.toUpperCase();
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') throw new TypeError('Укажите период повторения: день, неделя или месяц.');
  const zone = schedule.timezone ?? '';
  if (typeof zone !== 'string' || zone.length > 80 || !validZone(zone)) throw new TypeError('Некорректная временная зона расписания.');
  if (!Array.isArray(schedule.slots) || schedule.slots.length === 0 || schedule.slots.length > MAX_SLOTS) throw new TypeError('Укажите от 1 до 31 повторения.');
  const slots: ManualRecurrenceSlot[] = [];
  const seen = new Set<string>();
  for (const value of schedule.slots) {
    if (!value || typeof value.time !== 'string' || !TIME.test(value.time)) throw new TypeError('Укажите время повторения в формате ЧЧ:ММ.');
    if (freq === 'WEEKLY' && (!Number.isInteger(value.weekday) || value.weekday! < 1 || value.weekday! > 7)) throw new TypeError('Выберите день недели.');
    if (freq === 'MONTHLY' && (!Number.isInteger(value.monthDay) || value.monthDay! < 1 || value.monthDay! > 31)) throw new TypeError('Выберите день месяца.');
    const slot: ManualRecurrenceSlot = { time: value.time, ...(freq === 'WEEKLY' ? { weekday: value.weekday } : {}), ...(freq === 'MONTHLY' ? { monthDay: value.monthDay } : {}) };
    const key = JSON.stringify(slot);
    if (seen.has(key)) throw new TypeError('Одинаковые повторы по дню и времени нужно объединить.');
    seen.add(key); slots.push(slot);
  }
  if (schedule.until && (!Number.isFinite(new Date(schedule.until).getTime()))) throw new TypeError('Некорректная дата окончания повторений.');
  return { freq, zone, slots };
}
export function computeNextSlotRecurrenceDueDate(schedule: RecurrenceSchedule, baseline: Date): Date | null {
  const { freq, zone, slots } = validateManualRecurrenceSchedule(schedule);
  const local = dateFields(baseline, zone);
  const start = Date.UTC(local.year, local.month - 1, local.day);
  const until = schedule.until ? new Date(schedule.until) : null;
  for (let offset = 0; offset < 400; offset += 1) {
    const day = new Date(start + offset * 86400_000);
    const year = day.getUTCFullYear(), month = day.getUTCMonth() + 1, date = day.getUTCDate();
    const weekday = day.getUTCDay() || 7;
    for (const slot of slots) {
      if (freq === 'WEEKLY' && weekday !== slot.weekday) continue;
      if (freq === 'MONTHLY' && date !== slot.monthDay) continue;
      const [hour, minute] = slot.time.split(':').map(Number);
      const candidate = toZonedInstant(year, month, date, hour, minute, zone);
      if (candidate && candidate > baseline && (!until || candidate <= until)) {
        // Sort multiple slots within a day rather than using the UI order.
        const sameDay = slots.flatMap((other) => {
          if (freq === 'WEEKLY' && weekday !== other.weekday) return [];
          if (freq === 'MONTHLY' && date !== other.monthDay) return [];
          const [hh, mm] = other.time.split(':').map(Number);
          const proposed = toZonedInstant(year, month, date, hh, mm, zone);
          return proposed && proposed > baseline && (!until || proposed <= until) ? [proposed] : [];
        });
        return sameDay.sort((a, b) => a.getTime() - b.getTime())[0] ?? candidate;
      }
    }
  }
  return null;
}
export function makeManualRecurrenceSchedule(freq: 'DAILY' | 'WEEKLY' | 'MONTHLY', slots: ManualRecurrenceSlot[], timezone: string): RecurrenceSchedule {
  const schedule: RecurrenceSchedule = { rrule: 'FREQ=' + freq, timezone, until: null, slots };
  validateManualRecurrenceSchedule(schedule);
  return schedule;
}
