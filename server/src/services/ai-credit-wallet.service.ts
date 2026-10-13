import crypto from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { isGuestAccount, type GuestIdentity } from '../lib/guest-account.js';

export const AI_CREDIT_MILLI_PER_CREDIT = 1000;
export const MONTHLY_INCLUDED_CREDITS_MILLI = 100_000;

export type AiCreditBuckets = {
  aiIncludedCreditsMilli: number;
  aiBonusCreditsMilli: number;
  aiPurchasedCreditsMilli: number;
};

export type AiCreditReservation = {
  id: string;
  userId: string;
  period: string;
  includedMilli: number;
  bonusMilli: number;
  purchasedMilli: number;
  totalMilli: number;
};

type WalletRow = AiCreditBuckets & GuestIdentity & { id: string; aiCreditsPeriod: string; subscriptionPlan: string };
type WalletTransaction = Prisma.TransactionClient;
type WalletDatabase = Pick<PrismaClient, '$transaction'>;

export const currentAiCreditsPeriod = (now = new Date()) =>
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

export const getTotalAiCreditsMilli = (wallet: AiCreditBuckets) =>
  wallet.aiIncludedCreditsMilli + wallet.aiBonusCreditsMilli + wallet.aiPurchasedCreditsMilli;

export const creditsToMilli = (credits: number) => credits * AI_CREDIT_MILLI_PER_CREDIT;

export function calculateDebitBreakdown(wallet: AiCreditBuckets, amountMilli: number) {
  if (!Number.isSafeInteger(amountMilli) || amountMilli <= 0) throw new TypeError('amountMilli must be a positive safe integer');
  if (getTotalAiCreditsMilli(wallet) < amountMilli) return null;
  const includedMilli = Math.min(wallet.aiIncludedCreditsMilli, amountMilli);
  const afterIncluded = amountMilli - includedMilli;
  const bonusMilli = Math.min(wallet.aiBonusCreditsMilli, afterIncluded);
  return {
    includedMilli,
    bonusMilli,
    purchasedMilli: afterIncluded - bonusMilli,
    totalMilli: amountMilli
  };
}

const selectWalletForUpdate = async (tx: WalletTransaction, userId: string): Promise<WalletRow | null> => {
  const rows = await tx.$queryRaw<WalletRow[]>(Prisma.sql`
    SELECT "id", "aiCreditsPeriod", "aiIncludedCreditsMilli", "aiBonusCreditsMilli", "aiPurchasedCreditsMilli",
           "deviceId", "username", "passwordHash", "googleSub", "email", "telegramChatId", "subscriptionPlan"
    FROM "User"
    WHERE "id" = ${userId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
};

const updateWallet = async (tx: WalletTransaction, userId: string, wallet: AiCreditBuckets, period?: string) => {
  const totalMilli = getTotalAiCreditsMilli(wallet);
  return tx.user.update({
    where: { id: userId },
    data: {
      aiIncludedCreditsMilli: wallet.aiIncludedCreditsMilli,
      aiBonusCreditsMilli: wallet.aiBonusCreditsMilli,
      aiPurchasedCreditsMilli: wallet.aiPurchasedCreditsMilli,
      ...(period === undefined ? {} : { aiCreditsPeriod: period }),
      aiCredits: Math.floor(totalMilli / AI_CREDIT_MILLI_PER_CREDIT)
    }
  });
};

const refreshLockedWallet = async (tx: WalletTransaction, row: WalletRow, period: string): Promise<WalletRow> => {
  // Device-only guests must never receive the monthly included allowance.
  // Do not erase legacy/purchased records: mask them until registration logic
  // explicitly determines how to handle conversion.
  if (isGuestAccount(row)) return row;
  if (row.aiCreditsPeriod === period) return row;
  // Free accounts get a one-time trial (bonus bucket), never a recurring
  // monthly free grant. Keep existing included balances until their own
  // period rolls over. Paid plan behavior remains unchanged.
  const includedMilli = row.subscriptionPlan === 'free' ? 0 : MONTHLY_INCLUDED_CREDITS_MILLI;
  const refreshed = { ...row, aiIncludedCreditsMilli: includedMilli, aiCreditsPeriod: period };
  await updateWallet(tx, row.id, refreshed, period);
  return refreshed;
};

export async function getAiCreditWallet(userId: string, db: WalletDatabase = prisma) {
  return db.$transaction(async (tx) => {
    const row = await selectWalletForUpdate(tx, userId);
    if (!row) throw new Error('User not found');
    const wallet = await refreshLockedWallet(tx, row, currentAiCreditsPeriod());
    if (isGuestAccount(wallet)) {
      return {
        ...wallet,
        aiIncludedCreditsMilli: 0, aiBonusCreditsMilli: 0, aiPurchasedCreditsMilli: 0,
        aiCreditsMilli: 0, aiCredits: 0
      };
    }
    return { ...wallet, aiCreditsMilli: getTotalAiCreditsMilli(wallet), aiCredits: Math.floor(getTotalAiCreditsMilli(wallet) / 1000) };
  });
}

export const refreshIncludedCreditsPeriod = getAiCreditWallet;

export async function reserveAiCreditsMilli(userId: string, amountMilli: number, db: WalletDatabase = prisma): Promise<AiCreditReservation> {
  return db.$transaction(async (tx) => {
    const row = await selectWalletForUpdate(tx, userId);
    if (!row) throw new Error('User not found');
    if (isGuestAccount(row)) throw new Error('Недостаточно AI кредитов');
    const period = currentAiCreditsPeriod();
    const wallet = await refreshLockedWallet(tx, row, period);
    const debit = calculateDebitBreakdown(wallet, amountMilli);
    if (!debit) throw new Error('Недостаточно AI кредитов');
    const next = {
      aiIncludedCreditsMilli: wallet.aiIncludedCreditsMilli - debit.includedMilli,
      aiBonusCreditsMilli: wallet.aiBonusCreditsMilli - debit.bonusMilli,
      aiPurchasedCreditsMilli: wallet.aiPurchasedCreditsMilli - debit.purchasedMilli
    };
    await updateWallet(tx, userId, next, period);
    const id = crypto.randomUUID();
    await tx.aiCreditReservationRecord.create({ data: { id, userId, period, ...debit } });
    console.info('[AI wallet] debited', { userId, amountMilli, includedSpentMilli: debit.includedMilli, bonusSpentMilli: debit.bonusMilli, purchasedSpentMilli: debit.purchasedMilli, totalAfterMilli: getTotalAiCreditsMilli(next) });
    return { id, userId, period, ...debit };
  });
}

export async function reserveAiCreditsMilliUpTo(userId: string, minimumMilli: number, desiredMilli: number, db: WalletDatabase = prisma): Promise<AiCreditReservation> {
  if (!Number.isSafeInteger(minimumMilli) || minimumMilli <= 0 || !Number.isSafeInteger(desiredMilli) || desiredMilli < minimumMilli) {
    throw new TypeError('Invalid AI credit reservation range');
  }
  return db.$transaction(async (tx) => {
    const row = await selectWalletForUpdate(tx, userId);
    if (!row) throw new Error('User not found');
    if (isGuestAccount(row)) throw new Error('Недостаточно AI кредитов');
    const period = currentAiCreditsPeriod();
    const wallet = await refreshLockedWallet(tx, row, period);
    const balance = getTotalAiCreditsMilli(wallet);
    if (balance < minimumMilli) throw new Error('Недостаточно AI кредитов');
    const amountMilli = Math.min(balance, desiredMilli);
    const debit = calculateDebitBreakdown(wallet, amountMilli)!;
    const next = {
      aiIncludedCreditsMilli: wallet.aiIncludedCreditsMilli - debit.includedMilli,
      aiBonusCreditsMilli: wallet.aiBonusCreditsMilli - debit.bonusMilli,
      aiPurchasedCreditsMilli: wallet.aiPurchasedCreditsMilli - debit.purchasedMilli
    };
    await updateWallet(tx, userId, next, period);
    const id = crypto.randomUUID();
    await tx.aiCreditReservationRecord.create({ data: { id, userId, period, ...debit } });
    return { id, userId, period, ...debit };
  });
}

export const debitAiCreditsMilli = reserveAiCreditsMilli;

// Lock order is User row first, then this user's reservation. Every competing
// debit/finalization follows the same lock order, even across server workers.
type Finalization = {
  applied: boolean;
  chargedMilli: number;
  refundedMilli: number;
  expiredIncludedMilli: number;
  totalAfterMilli: number;
};

async function finalizeAiCreditReservation(
  reservation: AiCreditReservation,
  requestedChargeMilli: number,
  status: 'REFUNDED' | 'SETTLED',
  db: WalletDatabase = prisma
): Promise<Finalization> {
  if (!Number.isSafeInteger(requestedChargeMilli) || requestedChargeMilli < 0) {
    throw new TypeError('requestedChargeMilli must be a non-negative safe integer');
  }
  return db.$transaction(async (tx) => {
    const row = await selectWalletForUpdate(tx, reservation.userId);
    if (!row) throw new Error('User not found');
    const wallet = await refreshLockedWallet(tx, row, currentAiCreditsPeriod());
    const saved = await tx.aiCreditReservationRecord.findUnique({ where: { id: reservation.id } });
    if (!saved || saved.userId !== reservation.userId) {
      throw new Error('AI credit reservation not found');
    }
    if (saved.status !== 'RESERVED') {
      // Retry/replay: no refund or charge, including competing refund vs settle.
      return {
        applied: false, chargedMilli: 0, refundedMilli: 0, expiredIncludedMilli: 0,
        totalAfterMilli: getTotalAiCreditsMilli(wallet)
      };
    }
    const chargedMilli = Math.min(requestedChargeMilli, saved.totalMilli);
    const spent = chargedMilli === 0
      ? { includedMilli: 0, bonusMilli: 0, purchasedMilli: 0 }
      : calculateDebitBreakdown({
          aiIncludedCreditsMilli: saved.includedMilli,
          aiBonusCreditsMilli: saved.bonusMilli,
          aiPurchasedCreditsMilli: saved.purchasedMilli
        }, chargedMilli)!;
    const remainingIncluded = saved.includedMilli - spent.includedMilli;
    const remainingBonus = saved.bonusMilli - spent.bonusMilli;
    const remainingPurchased = saved.purchasedMilli - spent.purchasedMilli;

    // Monthly included credits expire when their period ends. Do not refund
    // expired allowance into the next month, but preserve bonus/purchased.
    const expiredIncludedMilli = saved.period === wallet.aiCreditsPeriod ? 0 : remainingIncluded;
    const creditedIncludedMilli = remainingIncluded - expiredIncludedMilli;
    const refundedMilli = creditedIncludedMilli + remainingBonus + remainingPurchased;
    const next = {
      aiIncludedCreditsMilli: wallet.aiIncludedCreditsMilli + creditedIncludedMilli,
      aiBonusCreditsMilli: wallet.aiBonusCreditsMilli + remainingBonus,
      aiPurchasedCreditsMilli: wallet.aiPurchasedCreditsMilli + remainingPurchased
    };
    await updateWallet(tx, reservation.userId, next, wallet.aiCreditsPeriod);
    await tx.aiCreditReservationRecord.update({
      where: { id: saved.id },
      data: { status, chargedMilli, refundedMilli, expiredIncludedMilli, settledAt: new Date() }
    });

    console.info('[AI wallet] reservation finalized', {
      userId: reservation.userId, reservationId: saved.id, status,
      chargedMilli, refundedMilli, expiredIncludedMilli,
      totalAfterMilli: getTotalAiCreditsMilli(next)
    });
    return { applied: true, chargedMilli, refundedMilli, expiredIncludedMilli, totalAfterMilli: getTotalAiCreditsMilli(next) };
  });
}

export async function refundAiCreditReservation(reservation: AiCreditReservation, db: WalletDatabase = prisma) {
  return finalizeAiCreditReservation(reservation, 0, 'REFUNDED', db);
}

export async function settleAiCreditReservation(reservation: AiCreditReservation, actualCreditsMilli: number, db: WalletDatabase = prisma) {
  return finalizeAiCreditReservation(reservation, actualCreditsMilli, 'SETTLED', db);
}

async function grantCreditsMilli(userId: string, amountMilli: number, bucket: 'bonus' | 'purchased', db: WalletDatabase = prisma) {
  if (!Number.isSafeInteger(amountMilli) || amountMilli <= 0) throw new TypeError('amountMilli must be a positive safe integer');
  return db.$transaction(async (tx) => {
    const row = await selectWalletForUpdate(tx, userId);
    if (!row) throw new Error('User not found');
    const wallet = await refreshLockedWallet(tx, row, currentAiCreditsPeriod());
    const next = {
      aiIncludedCreditsMilli: wallet.aiIncludedCreditsMilli,
      aiBonusCreditsMilli: wallet.aiBonusCreditsMilli + (bucket === 'bonus' ? amountMilli : 0),
      aiPurchasedCreditsMilli: wallet.aiPurchasedCreditsMilli + (bucket === 'purchased' ? amountMilli : 0)
    };
    return updateWallet(tx, userId, next, wallet.aiCreditsPeriod);
  });
}

export async function grantBonusCreditsMilliInTransaction(userId: string, amountMilli: number, tx: WalletTransaction) {
  if (!Number.isSafeInteger(amountMilli) || amountMilli <= 0) throw new TypeError('amountMilli must be a positive safe integer');
  const row = await selectWalletForUpdate(tx, userId);
  if (!row) throw new Error('User not found');
  const wallet = await refreshLockedWallet(tx, row, currentAiCreditsPeriod());
  const next = {
    aiIncludedCreditsMilli: wallet.aiIncludedCreditsMilli,
    aiBonusCreditsMilli: wallet.aiBonusCreditsMilli + amountMilli,
    aiPurchasedCreditsMilli: wallet.aiPurchasedCreditsMilli
  };
  return updateWallet(tx, userId, next, wallet.aiCreditsPeriod);
}

export async function grantPurchasedCreditsMilliInTransaction(userId: string, amountMilli: number, tx: WalletTransaction) {
  if (!Number.isSafeInteger(amountMilli) || amountMilli <= 0) throw new TypeError('amountMilli must be a positive safe integer');
  const row = await selectWalletForUpdate(tx, userId);
  if (!row) throw new Error('User not found');
  const wallet = await refreshLockedWallet(tx, row, currentAiCreditsPeriod());
  return updateWallet(tx, userId, {
    aiIncludedCreditsMilli: wallet.aiIncludedCreditsMilli,
    aiBonusCreditsMilli: wallet.aiBonusCreditsMilli,
    aiPurchasedCreditsMilli: wallet.aiPurchasedCreditsMilli + amountMilli
  }, wallet.aiCreditsPeriod);
}

export const grantBonusCreditsMilli = (userId: string, amountMilli: number, db: WalletDatabase = prisma) => grantCreditsMilli(userId, amountMilli, 'bonus', db);
export const grantPurchasedCreditsMilli = (userId: string, amountMilli: number, db: WalletDatabase = prisma) => grantCreditsMilli(userId, amountMilli, 'purchased', db);
