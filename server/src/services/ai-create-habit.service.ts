/** Server-side validation for a habit proposed by the general AI chat.
 * Values are validated again on approval, not trusted from the model or client. */
export type AiCreateHabitArgs = {
  name: string;
  icon: string;
  recurrenceType: 'DAILY' | 'WEEKDAYS' | 'INTERVAL';
  weekdays: number[];
  intervalDays: number | null;
  reminderTimes: string[];
  targetCount: number;
} & AiHabitDuration;
export type CreateHabitProposalAction = Record<string, unknown> & AiCreateHabitArgs & { operation: 'create_habit' };

export function validateAiCreateHabitArgs(value: unknown): AiCreateHabitArgs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Некорректные параметры привычки.');
  const data = value as Record<string, unknown>;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name || name.length > 180) throw new TypeError('Название привычки должно содержать от 1 до 180 символов.');
  const icon = typeof data.icon === 'string' && data.icon.trim() ? Array.from(data.icon.trim()).slice(0, 8).join('') : '✨';
  const recurrenceType = data.recurrenceType;
  if (!['DAILY', 'WEEKDAYS', 'INTERVAL'].includes(String(recurrenceType))) throw new TypeError('Неизвестный тип повторения привычки.');
  const intervalDays = recurrenceType === 'INTERVAL' ? data.intervalDays : null;
  if (recurrenceType === 'INTERVAL' && (!Number.isInteger(intervalDays) || Number(intervalDays) < 1 || Number(intervalDays) > 365)) {
    throw new TypeError('Интервал повторения должен составлять от 1 до 365 дней.');
  }
  const weekdays = recurrenceType === 'WEEKDAYS' ? data.weekdays : [];
  if (!Array.isArray(weekdays) || weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6) ||
      (recurrenceType === 'WEEKDAYS' && weekdays.length === 0)) {
    throw new TypeError('Укажите дни недели числами 0–6 (0 — воскресенье).');
  }
  if (!Array.isArray(data.reminderTimes) || data.reminderTimes.length > 24 ||
      data.reminderTimes.some(time => typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    throw new TypeError('Время уведомления должно быть в формате HH:mm; максимум 24 времени.');
  }
  const targetCount = data.targetCount;
  if (!Number.isInteger(targetCount) || Number(targetCount) < 1 || Number(targetCount) > 99) {
    throw new TypeError('Количество повторов в день должно быть от 1 до 99.');
  }
  return {
    name, icon, recurrenceType: recurrenceType as AiCreateHabitArgs['recurrenceType'],
    intervalDays: intervalDays as number | null,
    weekdays: [...new Set(weekdays as number[])].sort((a, b) => a - b),
    reminderTimes: [...new Set(data.reminderTimes as string[])].sort(),
    targetCount: targetCount as number,
    ...validateAiHabitDuration(data)
  };
}

export type AiHabitDuration = {
  durationMode: 'FOREVER' | 'UNTIL_DATE' | 'REPEAT_COUNT';
  endDate: string | null;
  totalRepeatTarget: number | null;
};
export function validateAiHabitDuration(data: Record<string, unknown>): AiHabitDuration {
  const mode = data.durationMode ?? 'FOREVER';
  if (mode !== 'FOREVER' && mode !== 'UNTIL_DATE' && mode !== 'REPEAT_COUNT')
    throw new TypeError('Неизвестный тип срока привычки.');
  if (mode === 'UNTIL_DATE') {
    const date = data.endDate;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)
      throw new TypeError('Укажите существующую дату YYYY-MM-DD.');
    return { durationMode: mode, endDate: date, totalRepeatTarget: null };
  }
  if (mode === 'REPEAT_COUNT') {
    const count = data.totalRepeatTarget;
    if (!Number.isInteger(count) || Number(count) < 1 || Number(count) > 9999)
      throw new TypeError('Общее число выполнений должно быть от 1 до 9999.');
    return { durationMode: mode, endDate: null, totalRepeatTarget: count as number };
  }
  return { durationMode: mode, endDate: null, totalRepeatTarget: null };
}
export function habitDurationLabel(duration: AiHabitDuration) {
  return duration.durationMode === 'UNTIL_DATE' ? 'До ' + duration.endDate :
    duration.durationMode === 'REPEAT_COUNT' ? 'Всего выполнений: ' + duration.totalRepeatTarget : 'Без срока';
}
export function aiHabitDateKey(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return part('year') + '-' + part('month') + '-' + part('day');
}
export function validateAiHabitCompletion(data: Record<string, unknown>) {
  const fullDay = data.fullDay ?? false;
  if (typeof fullDay !== 'boolean') throw new TypeError('fullDay должен быть логическим значением.');
  const amount = data.amount ?? 1;
  if (!Number.isInteger(amount) || Number(amount) < 1 || Number(amount) > 99)
    throw new TypeError('Количество выполнений должно быть от 1 до 99.');
  return { fullDay, amount: fullDay ? 99 : amount as number };
}
export type ExistingHabitProposalAction = Record<string, unknown> & {
  operation: 'complete_habit' | 'update_habit';
  habitId: string;
  expectedUpdatedAt: string;
};
export function isExistingHabitAction(action: Record<string, unknown>): action is ExistingHabitProposalAction {
  return action.operation === 'complete_habit' || action.operation === 'update_habit';
}
