import { prisma } from '../db/prisma.js';
import { telegramService } from './telegram.service.js';
import { economicLoanDueToday } from '../lib/economic-loan-reminder.js';

/**
 * Scans only opt-in, active Economic loans. The persisted conditional update
 * claims a month before sending so two instances cannot send duplicates.
 * A lost network acknowledgment is deliberately not retried automatically.
 */
export async function sendEconomicLoanPaymentReminders(now = new Date()) {
  if (!telegramService.isEnabled()) return 0;
  const loans = await prisma.economicLoan.findMany({
    where: { isClosed: false, remindersEnabled: true, paymentDate: { not: null } },
    include: { user: { select: { telegramChatId: true, timeZone: true } } },
    take: 500
  });
  let delivered = 0;
  for (const loan of loans) {
    if (!loan.paymentDate || !loan.user.telegramChatId) continue;
    const period = economicLoanDueToday(loan.paymentDate, now, loan.user.timeZone || 'Europe/Moscow');
    if (!period) continue;
    const claimed = await prisma.economicLoan.updateMany({
      where: {
        id: loan.id, isClosed: false, remindersEnabled: true,
        OR: [{ lastReminderPeriod: null }, { lastReminderPeriod: { not: period } }]
      },
      data: { lastReminderPeriod: period }
    });
    if (!claimed.count) continue;
    try {
      const monthlyRate = loan.annualRateBps / 10000 / 12;
      const principal = Number(loan.principalMinor);
      const payment = monthlyRate
        ? principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -loan.termMonths))
        : principal / loan.termMonths;
      const amount = loan.monthlyPaymentOverrideMinor ?? BigInt(Math.round(payment));
      const rubles = (amount / 100n).toLocaleString('ru-RU') + ',' + String(amount % 100n).padStart(2, '0') + ' ₽';
      const ok = await telegramService.sendAdminBroadcast(loan.user.telegramChatId, {
        text: '🔔 Экономыч AI: сегодня платёж по кредиту «' + loan.name + '».\nСумма: ' + rubles + '.\nОткройте раздел «Долги и кредиты» для учёта оплаты.'
      });
      if (ok) delivered++;
      else console.warn('[Economic] loan reminder not delivered', { loanId: loan.id, period });
    } catch (cause) {
      console.warn('[Economic] loan reminder dispatch failed', {
        loanId: loan.id, period, reason: cause instanceof Error ? cause.message : 'unknown'
      });
    }
  }
  return delivered;
}
