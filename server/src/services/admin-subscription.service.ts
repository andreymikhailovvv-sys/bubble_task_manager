import { enqueueSubscriptionWelcome } from './subscription-welcome.service.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { getSubscriptionPlanByKey, subscriptionEndDate } from '../config/subscription-plans.js';
import { currentAiCreditsPeriod } from './ai-credit-wallet.service.js';
import { isGuestAccount } from '../lib/guest-account.js';

export class AdminSubscriptionError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

const walletSelect = {
  id: true, subscriptionPlan: true, subscriptionExpiresAt: true, aiCreditsPeriod: true,
  aiCredits: true, aiIncludedCreditsMilli: true, aiBonusCreditsMilli: true, aiPurchasedCreditsMilli: true,
  deviceId: true, username: true, passwordHash: true, googleSub: true, email: true, telegramChatId: true
} satisfies Prisma.UserSelect;
type Wallet = Prisma.UserGetPayload<{ select: typeof walletSelect }>;

function snapshot(user: Wallet) {
  return {
    id: user.id, subscriptionPlan: user.subscriptionPlan, subscriptionExpiresAt: user.subscriptionExpiresAt,
    aiCreditsPeriod: user.aiCreditsPeriod, aiCredits: user.aiCredits,
    aiIncludedCreditsMilli: user.aiIncludedCreditsMilli, aiBonusCreditsMilli: user.aiBonusCreditsMilli,
    aiPurchasedCreditsMilli: user.aiPurchasedCreditsMilli, isGuest: isGuestAccount(user)
  };
}

export type AdminSubscriptionInput = {
  userId: string; subscriptionPlan: string; requestId: string; expectedPeriod: string;
  expectedPlan: string; expectedExpiresAt: string | null; reason: string;
};

export async function setAdminSubscription(input: AdminSubscriptionInput, db: Pick<typeof prisma, '$transaction'> = prisma, clock = () => new Date()) {
  const plan = getSubscriptionPlanByKey(input.subscriptionPlan);
  if (!plan && input.subscriptionPlan !== 'free') throw new AdminSubscriptionError(400, 'Неизвестный тариф');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId) ||
      typeof input.expectedPeriod !== 'string' || typeof input.expectedPlan !== 'string' ||
      !(input.expectedExpiresAt === null || typeof input.expectedExpiresAt === 'string') ||
      typeof input.reason !== 'string' || input.reason.length > 500) {
    throw new AdminSubscriptionError(400, 'Некорректные параметры изменения подписки');
  }
  return db.$transaction(async tx => {
    // Same row lock as payment checkout, activation, debit and refund.
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`);
    const user = await tx.user.findUnique({ where: { id: input.userId }, select: walletSelect });
    if (!user) throw new AdminSubscriptionError(404, 'Пользователь не найден');
    const replay = await tx.adminSubscriptionChange.findUnique({ where: { id: input.requestId } });
    if (replay) {
      if (replay.userId !== user.id || replay.nextPlan !== input.subscriptionPlan)
        throw new AdminSubscriptionError(409, 'Идентификатор операции уже использован');
      return { user: snapshot(user), changed: false, replay: true };
    }
    if (user.aiCreditsPeriod !== input.expectedPeriod || user.subscriptionPlan !== input.expectedPlan ||
        (user.subscriptionExpiresAt?.toISOString() ?? null) !== input.expectedExpiresAt) {
      throw new AdminSubscriptionError(409, 'Подписка изменилась. Обновите список пользователей перед повторной операцией.');
    }
    if (plan && isGuestAccount(user)) throw new AdminSubscriptionError(403, 'Сначала пользователь должен зарегистрироваться');
    const now = clock();
    const active = Boolean(user.subscriptionExpiresAt && user.subscriptionExpiresAt > now);
    const unchanged = user.subscriptionPlan === input.subscriptionPlan &&
      (plan ? active : !user.subscriptionExpiresAt && user.aiIncludedCreditsMilli === 0);
    let updated = user;
    if (!unchanged) {
      const pending = await tx.subscriptionPurchase.findFirst({ where: {
        userId: user.id, status: { in: ['created', 'pending', 'create_failed'] }
      }, select: { id: true } });
      if (pending) throw new AdminSubscriptionError(409, 'Есть незавершённая оплата подписки. Дождитесь подтверждения или отмены платежа.');
      const included = plan ? plan.creditsAmount * 1000 : 0;
      updated = await tx.user.update({
        where: { id: user.id }, select: walletSelect,
        data: {
          subscriptionPlan: input.subscriptionPlan,
          subscriptionExpiresAt: plan ? subscriptionEndDate(now) : null,
          aiCreditsPeriod: plan ? `admin-subscription:${input.requestId}` : `free:${currentAiCreditsPeriod(now)}:${input.requestId}`,
          aiIncludedCreditsMilli: included,
          subscriptionAllowanceMilli: included,
          aiCredits: Math.floor((included + user.aiBonusCreditsMilli + user.aiPurchasedCreditsMilli) / 1000)
        }
      });
    }
    if (!unchanged && plan) await enqueueSubscriptionWelcome(tx, user.id, plan.key, `admin:${input.requestId}`);
    await tx.adminSubscriptionChange.create({ data: {
      id: input.requestId, userId: user.id,
      action: unchanged ? 'noop' : !plan ? 'cancel' : active ? 'replace' : 'grant',
      previousPlan: user.subscriptionPlan, nextPlan: updated.subscriptionPlan,
      previousExpiresAt: user.subscriptionExpiresAt, nextExpiresAt: updated.subscriptionExpiresAt,
      previousIncludedMilli: user.aiIncludedCreditsMilli, nextIncludedMilli: updated.aiIncludedCreditsMilli,
      previousPeriod: user.aiCreditsPeriod, nextPeriod: updated.aiCreditsPeriod,
      reason: input.reason.trim(), createdAt: now
    } });
    return { user: snapshot(updated), changed: !unchanged, replay: false };
  });
}
