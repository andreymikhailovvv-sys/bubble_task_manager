/**
 * Whether a habit is due on a given calendar day in its owner's time zone.
 * weekdays use JavaScript/Prisma convention: Sunday=0, Friday=5.
 * Both in-app notifications and Telegram are emitted by the same server worker,
 * so filtering here fixes delivery to Android and the Telegram Mini App.
 */
export type ScheduledHabit = {
  recurrenceType: string;
  weekdays: unknown;
  intervalDays: number | null;
  createdAt: Date;
  durationMode: string;
  endDate: Date | null;
};

const dayNumber = (key: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const day = Date.parse(key + 'T00:00:00.000Z');
  return Number.isFinite(day) ? Math.floor(day / 86_400_000) : null;
};

export function habitScheduledOnLocalDay(
  habit: ScheduledHabit,
  dateKey: string,
  createdDateKey: string
): boolean {
  const day = dayNumber(dateKey);
  const createdDay = dayNumber(createdDateKey);
  if (day === null || createdDay === null || day < createdDay) return false;
  // The end date is a date-only choice stored as UTC end-of-day by the habit
  // service. Never send after that chosen calendar date.
  if (habit.durationMode === 'UNTIL_DATE' && habit.endDate &&
      dateKey > habit.endDate.toISOString().slice(0, 10)) return false;
  if (habit.recurrenceType === 'WEEKDAYS') {
    const weekdays = Array.isArray(habit.weekdays) ? habit.weekdays : [];
    const weekday = new Date(dateKey + 'T12:00:00.000Z').getUTCDay();
    return weekdays.includes(weekday);
  }
  if (habit.recurrenceType === 'INTERVAL') {
    const interval = Math.max(1, Math.trunc(habit.intervalDays ?? 1));
    return (day - createdDay) % interval === 0;
  }
  return true;
}
