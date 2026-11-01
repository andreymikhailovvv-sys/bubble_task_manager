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
};
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
      data.reminderTimes.some(time => typeof time !== 'string' || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(time))) {
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
    targetCount: targetCount as number
  };
}
