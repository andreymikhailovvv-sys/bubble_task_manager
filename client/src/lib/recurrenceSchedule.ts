export type RecurrencePeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type RecurrenceSlot = { time: string; weekday?: number; monthDay?: number };
export type RecurrenceRule = {
  rrule: string; timezone: string; until: string | null; slots?: RecurrenceSlot[];
};

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
export const recurrenceWeekdays = [
  { value: 1, label: 'Пн' }, { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' }, { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' }, { value: 6, label: 'Сб' },
  { value: 7, label: 'Вс' }
];
export const defaultRecurrenceSlots = (): RecurrenceSlot[] => [{ time: '09:00', weekday: 1, monthDay: 1 }];
export function buildManualRecurrence(period: RecurrencePeriod, slots: RecurrenceSlot[], timezone: string): { schedule: RecurrenceRule; summary: string } {
  if (!slots.length || slots.length > 31) throw new Error('Укажите от 1 до 31 повторения.');
  const checked = slots.map((slot) => {
    if (!timePattern.test(slot.time)) throw new Error('Выберите корректное время для каждого повторения.');
    if (period === 'WEEKLY' && (!Number.isInteger(slot.weekday) || slot.weekday! < 1 || slot.weekday! > 7)) throw new Error('Выберите день недели.');
    if (period === 'MONTHLY' && (!Number.isInteger(slot.monthDay) || slot.monthDay! < 1 || slot.monthDay! > 31)) throw new Error('Выберите день месяца.');
    return {
      time: slot.time,
      ...(period === 'WEEKLY' ? { weekday: slot.weekday } : {}),
      ...(period === 'MONTHLY' ? { monthDay: slot.monthDay } : {})
    };
  });
  if (new Set(checked.map((item) => JSON.stringify(item))).size !== checked.length) throw new Error('Повторения с одинаковыми днями и временем совпадают. Измените один из них.');
  const schedule = { rrule: 'FREQ=' + period, timezone, until: null, slots: checked };
  const unit = period === 'DAILY' ? 'день' : period === 'WEEKLY' ? 'неделю' : 'месяц';
  return { schedule, summary: checked.length + ' раз в ' + unit };
}
export function loadManualRecurrence(value: unknown): { period: RecurrencePeriod; slots: RecurrenceSlot[] } | null {
  if (!value || typeof value !== 'object') return null;
  const rule = value as Partial<RecurrenceRule>;
  if (!Array.isArray(rule.slots) || rule.slots.length === 0) return null;
  const period = /^FREQ=(DAILY|WEEKLY|MONTHLY)(?:;|$)/.exec(rule.rrule ?? '')?.[1] as RecurrencePeriod | undefined;
  if (!period) return null;
  try {
    buildManualRecurrence(period, rule.slots, rule.timezone || 'Europe/Moscow');
    return { period, slots: rule.slots };
  } catch { return null; }
}
