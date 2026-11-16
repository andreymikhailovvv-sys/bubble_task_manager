/**
 * Date-only payments recur monthly on their chosen day. Months shorter than
 * that day use the last calendar day. Reminder dispatch uses the user's zone.
 */
export function economicLoanDueToday(paymentDate: Date, now: Date, timeZone: string): string | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);
  } catch { return null; }
  const pick = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const year = pick('year'), month = pick('month'), day = pick('day'), hour = pick('hour');
  const scheduledYear = paymentDate.getUTCFullYear();
  const scheduledMonth = paymentDate.getUTCMonth() + 1;
  if (year * 12 + month < scheduledYear * 12 + scheduledMonth || hour < 9) return null;
  const dueDay = Math.min(paymentDate.getUTCDate(), new Date(Date.UTC(year, month, 0)).getUTCDate());
  return day === dueDay ? String(year) + '-' + String(month).padStart(2, '0') : null;
}
