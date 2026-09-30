import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../db/prisma.js';

export const AI_CREDIT_MILLI_PER_CREDIT = 1000;
export const MONTHLY_INCLUDED_CREDITS_MILLI = 100_000;

export type AiCreditBuckets = {
  aiIncludedCreditsMilli: number;
  aiBonusCreditsMilli: number;
  aiPurchasedCreditsMilli: number;
};

export type AiCreditReservation = {
  userId: string;
  period: string;
  includedMilli: number;
  bonusMilli: number;
  purchasedMilli: number;
  totalMilli: number;
};

type WalletRow = AiCreditBuckets & { id: string; aiCreditsPeriod: string };
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
    SELECT "id", "aiCreditsPeriod", "aiIncludedCreditsMilli", "aiBonusCreditsMilli", "aiPurchasedCreditsMilli"
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
  if (row.aiCreditsPeriod === period) return row;
  const refreshed = { ...row, aiIncludedCreditsMilli: MONTHLY_INCLUDED_CREDITS_MILLI, aiCreditsPeriod: period };
  await updateWallet(tx, row.id, refreshed, period);
  return refreshed;
};

export async function getAiCreditWallet(userId: string, db: WalletDatabase = prisma) {
  return db.$transaction(async (tx) => {
    const row = await selectWalletForUpdate(tx, userId);
    if (!row) throw new Error('User not found');
    const wallet = await refreshLockedWallet(tx, row, currentAiCreditsPeriod());
    return { ...wallet, aiCreditsMilli: getTotalAiCreditsMilli(wallet), aiCredits: Math.floor(getTotalAiCreditsMilli(wallet) / 1000) };
  });
}

export const refreshIncludedCreditsPeriod = getAiCreditWallet;

export async function reserveAiCreditsMilli(userId: string, amountMilli: number, db: WalletDatabase = prisma): Promise<AiCreditReservation> {
  return db.$transaction(async (tx) => {
    const row = await selectWalletForUpdate(tx, userId);
    if (!row) throw new Error('User not found');
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
    console.info('[AI wallet] debited', { userId, amountMilli, includedSpentMilli: debit.includedMilli, bonusSpentMilli: debit.bonusMilli, purchasedSpentMilli: debit.purchasedMilli, totalAfterMilli: getTotalAiCreditsMilli(next) });
    return { userId, period, ...debit };
  });
}

export async function reserveAiCreditsMilliUpTo(userId: string, minimumMilli: number, desiredMilli: number, db: WalletDatabase = prisma): Promise<AiCreditReservation> {
  if (!Number.isSafeInteger(minimumMilli) || minimumMilli <= 0 || !Number.isSafeInteger(desiredMilli) || desiredMilli < minimumMilli) {
    throw new TypeError('Invalid AI credit reservation range');
  }
  return db.$transaction(async (tx) => {
    const row = await selectWalletForUpdate(tx, userId);
    if (!row) throw new Error('User not found');
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
    return { userId, period, ...debit };
  });
}

export const debitAiCreditsMilli = reserveAiCreditsMilli;

export async function refundAiCreditReservation(reservation: AiCreditReservation, db: WalletDatabase = prisma) {
  return db.$transaction(async (tx) => {
    const row = await selectWalletForUpdate(tx, reservation.userId);
    if (!row) throw new Error('User not found');
    const next = {
      aiIncludedCreditsMilli: row.aiIncludedCreditsMilli + reservation.includedMilli,
      aiBonusCreditsMilli: row.aiBonusCreditsMilli + reservation.bonusMilli,
      aiPurchasedCreditsMilli: row.aiPurchasedCreditsMilli + reservation.purchasedMilli
    };
    const updated = await updateWallet(tx, reservation.userId, next);
    console.info('[AI wallet] refunded', { userId: reservation.userId, amountMilli: reservation.totalMilli, totalAfterMilli: getTotalAiCreditsMilli(next) });
    return updated;
  });
}

export async function settleAiCreditReservation(reservation: AiCreditReservation, actualCreditsMilli: number, db: WalletDatabase = prisma) {
  if (!Number.isSafeInteger(actualCreditsMilli) || actualCreditsMilli < 0) throw new TypeError('actualCreditsMilli must be a non-negative safe integer');
  const chargedMilli = Math.min(actualCreditsMilli, reservation.totalMilli);
  const charged = calculateDebitBreakdown({
    aiIncludedCreditsMilli: reservation.includedMilli,
    aiBonusCreditsMilli: reservation.bonusMilli,
    aiPurchasedCreditsMilli: reservation.purchasedMilli
  }, chargedMilli || 1);
  const spent = chargedMilli === 0 ? { includedMilli: 0, bonusMilli: 0, purchasedMilli: 0 } : charged!;
  const refund: AiCreditReservation = {
    ...reservation,
    includedMilli: reservation.includedMilli - spent.includedMilli,
    bonusMilli: reservation.bonusMilli - spent.bonusMilli,
    purchasedMilli: reservation.purchasedMilli - spent.purchasedMilli,
    totalMilli: reservation.totalMilli - chargedMilli
  };
  const updated = refund.totalMilli > 0 ? await refundAiCreditReservation(refund, db) : await getAiCreditWallet(reservation.userId, db);
  return { chargedMilli, refundedMilli: refund.totalMilli, totalAfterMilli: getTotalAiCreditsMilli(updated) };
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

export const grantBonusCreditsMilli = (userId: string, amountMilli: number, db: WalletDatabase = prisma) => grantCreditsMilli(userId, amountMilli, 'bonus', db);
export const grantPurchasedCreditsMilli = (userId: string, amountMilli: number, db: WalletDatabase = prisma) => grantCreditsMilli(userId, amountMilli, 'purchased', db);
