import { Prisma } from '@prisma/client';
import { economicSourceDelta } from '../lib/economic-debt.js';

/** Net movement after the stored baseline. Balance = baseline + movement.
 * The calculation includes debt postings and both sides of transfers.
 * Keep bigint precision: never convert monetary amounts through Number. */
export async function economicAccountMovementMinor(
  tx: Prisma.TransactionClient, owner: string, accountId: string
): Promise<bigint> {
  const [outgoing, incoming] = await Promise.all([
    tx.economicOperation.groupBy({
      by: ['kind'], where: { userId: owner, sourceAccountId: accountId },
      _sum: { amountMinor: true }
    }),
    tx.economicOperation.aggregate({
      where: { userId: owner, kind: 'TRANSFER', targetAccountId: accountId },
      _sum: { amountMinor: true }
    })
  ]);
  return outgoing.reduce((sum, row) =>
    sum + economicSourceDelta(row.kind, row._sum.amountMinor ?? 0n), 0n) +
    (incoming._sum.amountMinor ?? 0n);
}

/** Set the displayed CURRENT balance without altering past operations.
 * The historical opening baseline is an internal accounting offset only. */
export async function openingForTargetBalance(
  tx: Prisma.TransactionClient, owner: string, accountId: string,
  targetBalanceMinor: bigint
): Promise<bigint> {
  return targetBalanceMinor - await economicAccountMovementMinor(tx, owner, accountId);
}

/** Record a human/AI balance correction as a real signed income/expense movement.
 * Preserve the historical baseline, never count the correction as earned income or spending.
 * Call within a serializable transaction that also owns the account update. */
export async function recordEconomicBalanceAdjustment(
  tx: Prisma.TransactionClient, owner: string, accountId: string,
  openingBalanceMinor: bigint, targetBalanceMinor: bigint
): Promise<bigint> {
  const current = openingBalanceMinor + await economicAccountMovementMinor(tx, owner, accountId);
  const delta = targetBalanceMinor - current;
  if (delta === 0n) return 0n;
  await tx.economicOperation.create({data: {
    userId: owner, sourceAccountId: accountId,
    kind: delta > 0n ? 'INCOME' : 'EXPENSE',
    amountMinor: delta > 0n ? delta : -delta,
    title: delta > 0n ? 'Корректировка баланса (+)' : 'Корректировка баланса (−)',
    category: 'Корректировка', isAdjustment: true,
    occurredAt: new Date()
  }});
  return delta;
}
