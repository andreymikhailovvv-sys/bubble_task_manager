import type { Prisma } from '@prisma/client';
import { getSubscriptionPlanByKey } from '../config/subscription-plans.js';

type SubscriptionWallet = {
  id: string;
  subscriptionPlan?: string;
  subscriptionExpiresAt?: Date | null;
  aiCreditsPeriod?: string;
  aiIncludedCreditsMilli?: number;
};

export function subscriptionWindowBounds(now: Date) {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(dayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  return { dayStart, weekStart, dayEnd, weekEnd };
}

export async function getSubscriptionWindowLimits(
  db: Pick<Prisma.TransactionClient, 'aiCreditReservationRecord'>,
  wallet: SubscriptionWallet, now = new Date()
) {
  const plan = getSubscriptionPlanByKey(wallet.subscriptionPlan ?? '');
  if (!plan || !wallet.subscriptionExpiresAt || wallet.subscriptionExpiresAt <= now || !wallet.aiCreditsPeriod) return null;
  const { dayStart, weekStart, dayEnd, weekEnd } = subscriptionWindowBounds(now);
  const records = await db.aiCreditReservationRecord.findMany({
    where: { userId: wallet.id, period: wallet.aiCreditsPeriod, createdAt: { gte: weekStart }, status: { in: ['RESERVED', 'SETTLED'] } },
    select: { createdAt: true, status: true, includedMilli: true, chargedMilli: true }
  });
  let dailyUsed = 0, weeklyUsed = 0;
  for (const record of records) {
    const used = record.status === 'RESERVED' ? record.includedMilli : Math.min(record.includedMilli, record.chargedMilli);
    weeklyUsed += used;
    if (record.createdAt >= dayStart) dailyUsed += used;
  }
  const weeklyCap = Math.floor(plan.creditsAmount * 1000 / 4);
  const dailyCap = Math.floor(plan.creditsAmount * 1000 / 20);
  const monthlyRemaining = Math.max(0, wallet.aiIncludedCreditsMilli ?? 0);
  const weeklyRemaining = Math.max(0, Math.min(weeklyCap - weeklyUsed, monthlyRemaining));
  const dailyRemaining = Math.max(0, Math.min(dailyCap - dailyUsed, weeklyRemaining));
  const window = (capMilli: number, remainingMilli: number, resetsAt: Date) => ({
    capMilli, remainingMilli, remainingPercent: Math.ceil(remainingMilli * 100 / capMilli),
    resetsAt: new Date(Math.min(resetsAt.getTime(), wallet.subscriptionExpiresAt!.getTime())).toISOString()
  });
  return { daily: window(dailyCap, dailyRemaining, dayEnd), weekly: window(weeklyCap, weeklyRemaining, weekEnd) };
}
