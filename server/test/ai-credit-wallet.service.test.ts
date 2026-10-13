import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  calculateDebitBreakdown,
  creditsToMilli,
  currentAiCreditsPeriod,
  getAiCreditWallet,
  getTotalAiCreditsMilli,
  grantBonusCreditsMilli,
  grantPurchasedCreditsMilli,
  refundAiCreditReservation,
  reserveAiCreditsMilli,
  reserveAiCreditsMilliUpTo,
  settleAiCreditReservation,
  type AiCreditReservation
} from '../src/services/ai-credit-wallet.service.js';

type State = {
  id: string;
  aiCredits: number;
  aiCreditsPeriod: string;
  subscriptionPlan?: string;
  aiIncludedCreditsMilli: number;
  aiBonusCreditsMilli: number;
  aiPurchasedCreditsMilli: number;
  deviceId?: string | null;
  username?: string | null;
  passwordHash?: string | null;
  googleSub?: string | null;
  email?: string | null;
  telegramChatId?: string | null;
};

type ReservationRow = AiCreditReservation & {
  status: 'RESERVED' | 'SETTLED' | 'REFUNDED';
  chargedMilli: number;
  refundedMilli: number;
  expiredIncludedMilli: number;
  settledAt: Date | null;
};

class FakeWalletDatabase {
  private queue = Promise.resolve();
  public reservations = new Map<string, ReservationRow>();
  constructor(public state: State | null) {}

  $transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    const run = this.queue.then(() => callback({
      $queryRaw: async () => this.state ? [{ ...this.state }] : [],
      user: {
        update: async ({ data }: { data: Partial<State> }) => {
          if (!this.state) throw new Error('User not found');
          this.state = { ...this.state, ...data };
          return { ...this.state };
        }
      },
      aiCreditReservationRecord: {
        create: async ({ data }: { data: AiCreditReservation }) => {
          if (this.reservations.has(data.id)) throw new Error('duplicate reservation id');
          this.reservations.set(data.id, {
            ...data, status: 'RESERVED', chargedMilli: 0, refundedMilli: 0,
            expiredIncludedMilli: 0, settledAt: null
          });
        },
        findUnique: async ({ where }: { where: { id: string } }) => {
          const row = this.reservations.get(where.id);
          return row ? { ...row } : null;
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<ReservationRow> }) => {
          const row = this.reservations.get(where.id);
          if (!row) throw new Error('reservation not found');
          this.reservations.set(where.id, { ...row, ...data });
        }
      }
    }));
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }
}

const wallet = (overrides: Partial<State> = {}) => new FakeWalletDatabase({
  id: 'user-1',
  aiCredits: 100,
  aiCreditsPeriod: currentAiCreditsPeriod(),
  aiIncludedCreditsMilli: 100_000,
  aiBonusCreditsMilli: 0,
  aiPurchasedCreditsMilli: 0,
  ...overrides
});

test('migration сохраняет 36 legacy credits как 36000 bonus milli', async () => {
  const sql = await readFile(new URL('../prisma/migrations/20260930200000_add_ai_credit_wallet/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /"aiBonusCreditsMilli" = \("aiCredits"::bigint \* 1000\)::integer/);
  assert.match(sql, /"aiIncludedCreditsMilli" = 0/);
  assert.match(sql, /RAISE EXCEPTION 'AI credit wallet migration sanity check failed/);
  assert.equal(36 * 1000, 36_000);
});

test('считает total и расходует included, затем bonus, затем purchased', () => {
  const buckets = { aiIncludedCreditsMilli: 3_000, aiBonusCreditsMilli: 5_000, aiPurchasedCreditsMilli: 9_000 };
  assert.equal(getTotalAiCreditsMilli(buckets), 17_000);
  assert.deepEqual(calculateDebitBreakdown(buckets, 2_000), { includedMilli: 2_000, bonusMilli: 0, purchasedMilli: 0, totalMilli: 2_000 });
  assert.deepEqual(calculateDebitBreakdown(buckets, 7_000), { includedMilli: 3_000, bonusMilli: 4_000, purchasedMilli: 0, totalMilli: 7_000 });
  assert.deepEqual(calculateDebitBreakdown(buckets, 12_000), { includedMilli: 3_000, bonusMilli: 5_000, purchasedMilli: 4_000, totalMilli: 12_000 });
  assert.equal(calculateDebitBreakdown(buckets, 17_001), null);
});

test('reservation не допускает отрицательных buckets и refund возвращает исходный breakdown', async () => {
  const db = wallet({ aiCredits: 17, aiIncludedCreditsMilli: 3_000, aiBonusCreditsMilli: 5_000, aiPurchasedCreditsMilli: 9_000 });
  const before = { ...db.state };
  const reservation = await reserveAiCreditsMilli('user-1', 12_000, db as any);
  assert.deepEqual({ included: reservation.includedMilli, bonus: reservation.bonusMilli, purchased: reservation.purchasedMilli }, { included: 3_000, bonus: 5_000, purchased: 4_000 });
  assert.deepEqual([db.state?.aiIncludedCreditsMilli, db.state?.aiBonusCreditsMilli, db.state?.aiPurchasedCreditsMilli, db.state?.aiCredits], [0, 0, 5_000, 5]);
  await refundAiCreditReservation(reservation, db as any);
  assert.deepEqual(db.state, before);
});

test('недостаточный total отклоняется без изменения wallet', async () => {
  const db = wallet({ aiCredits: 4, aiIncludedCreditsMilli: 4_999 });
  const before = { ...db.state };
  await assert.rejects(reserveAiCreditsMilli('user-1', 5_000, db as any), /Недостаточно AI кредитов/);
  assert.deepEqual(db.state, before);
});

test('monthly refresh заменяет только included и обновляет legacy mirror', async () => {
  const db = wallet({ aiCreditsPeriod: '2000-01', aiCredits: 519, aiIncludedCreditsMilli: 12_000, aiBonusCreditsMilli: 7_000, aiPurchasedCreditsMilli: 500_000 });
  const result = await getAiCreditWallet('user-1', db as any);
  assert.deepEqual([result.aiIncludedCreditsMilli, result.aiBonusCreditsMilli, result.aiPurchasedCreditsMilli], [100_000, 7_000, 500_000]);
  assert.equal(db.state?.aiCredits, 607);
});

test('admin/training bonus и future purchase grants используют правильные buckets', async () => {
  const db = wallet();
  await grantBonusCreditsMilli('user-1', creditsToMilli(10), db as any);
  await grantBonusCreditsMilli('user-1', creditsToMilli(5), db as any);
  await grantPurchasedCreditsMilli('user-1', 20_000, db as any);
  assert.deepEqual([db.state?.aiBonusCreditsMilli, db.state?.aiPurchasedCreditsMilli, db.state?.aiCredits], [15_000, 20_000, 135]);
});

test('параллельные debit сериализуются и не допускают double spend', async () => {
  const db = wallet({ aiCredits: 5, aiIncludedCreditsMilli: 5_000 });
  const results = await Promise.allSettled([
    reserveAiCreditsMilli('user-1', 5_000, db as any),
    reserveAiCreditsMilli('user-1', 5_000, db as any)
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(db.state?.aiIncludedCreditsMilli, 0);
  assert.equal(db.state?.aiCredits, 0);
});

test('старые fixed цены переводятся в milli без динамического billing', () => {
  assert.deepEqual([creditsToMilli(2), creditsToMilli(5), creditsToMilli(8)], [2_000, 5_000, 8_000]);
});

test('range reservation ограничивается балансом и settlement возвращает остаток в исходные buckets', async () => {
  const db = wallet({ aiCredits: 10, aiIncludedCreditsMilli: 1_000, aiBonusCreditsMilli: 9_000 });
  const reservation = await reserveAiCreditsMilliUpTo('user-1', 4_000, 12_000, db as any);
  assert.deepEqual([reservation.includedMilli, reservation.bonusMilli, reservation.totalMilli], [1_000, 9_000, 10_000]);
  const settlement = await settleAiCreditReservation(reservation, 1_500, db as any);
  assert.deepEqual(settlement, { applied: true, chargedMilli: 1_500, refundedMilli: 8_500, expiredIncludedMilli: 0, totalAfterMilli: 8_500 });
  assert.deepEqual([db.state?.aiIncludedCreditsMilli, db.state?.aiBonusCreditsMilli, db.state?.aiPurchasedCreditsMilli], [0, 8_500, 0]);
});

test('range reservation атомарно отклоняет недостаточный minimum', async () => {
  const db = wallet({ aiCredits: 3, aiIncludedCreditsMilli: 3_999 });
  await assert.rejects(reserveAiCreditsMilliUpTo('user-1', 4_000, 8_000, db as any), /Недостаточно AI кредитов/);
  assert.equal(db.state?.aiIncludedCreditsMilli, 3_999);
});

test('guest wallet reports zero, never refreshes monthly included credits, and refuses all reservations', async () => {
  const db = wallet({
    deviceId: 'device-guest',
    username: null,
    passwordHash: null,
    googleSub: null,
    email: null,
    telegramChatId: null,
    aiCreditsPeriod: '2020-01',
    aiCredits: 115,
    aiIncludedCreditsMilli: 100_000,
    aiBonusCreditsMilli: 5_000,
    aiPurchasedCreditsMilli: 10_000
  });
  const before = { ...db.state };
  const view = await getAiCreditWallet('user-1', db as any);
  assert.equal(view.aiCredits, 0);
  assert.equal(view.aiCreditsMilli, 0);
  assert.deepEqual([view.aiIncludedCreditsMilli, view.aiBonusCreditsMilli, view.aiPurchasedCreditsMilli], [0, 0, 0]);
  await assert.rejects(reserveAiCreditsMilli('user-1', 1000, db as any), /Недостаточно AI кредитов/);
  await assert.rejects(reserveAiCreditsMilliUpTo('user-1', 1000, 2000, db as any), /Недостаточно AI кредитов/);
  assert.deepEqual(db.state, before, 'legacy balances must be preserved without spending or monthly refill');
});

test('registered users keep monthly refresh and debit even if deviceId is still set', async () => {
  const db = wallet({ deviceId: 'old-device', username: 'registered', passwordHash: 'hash', aiCreditsPeriod: '2020-01' });
  const balance = await getAiCreditWallet('user-1', db as any);
  assert.equal(balance.aiIncludedCreditsMilli, 100_000);
  const reservation = await reserveAiCreditsMilli('user-1', 2000, db as any);
  assert.equal(reservation.totalMilli, 2000);
  assert.equal(db.state?.aiIncludedCreditsMilli, 98_000);
});

test('free users cannot receive the 100 trial again on next monthly refresh', async () => {
  const db = wallet({
    subscriptionPlan: 'free', aiCreditsPeriod: '2020-01',
    aiCredits: 3, aiIncludedCreditsMilli: 3_000, aiBonusCreditsMilli: 0, aiPurchasedCreditsMilli: 0
  });
  const result = await getAiCreditWallet('user-1', db as any);
  assert.equal(result.aiIncludedCreditsMilli, 0);
  assert.equal(result.aiCredits, 0);
  assert.equal(db.state?.aiCreditsPeriod, currentAiCreditsPeriod());
});

test('paid plan keeps previously configured included credits on next month', async () => {
  const db = wallet({ subscriptionPlan: 'pro', aiCreditsPeriod: '2020-01', aiIncludedCreditsMilli: 0, aiCredits: 0 });
  const result = await getAiCreditWallet('user-1', db as any);
  assert.equal(result.aiIncludedCreditsMilli, 100_000);
});

test('one reservation can be refunded at most once across retries', async () => {
  const db = wallet({ aiIncludedCreditsMilli: 1_000, aiBonusCreditsMilli: 3_000, aiCredits: 4 });
  const before = { ...db.state };
  const reservation = await reserveAiCreditsMilli('user-1', 3_000, db as any);
  assert.equal(db.reservations.get(reservation.id)?.status, 'RESERVED');
  const first = await refundAiCreditReservation(reservation, db as any);
  const replay = await refundAiCreditReservation(reservation, db as any);
  assert.equal(first.applied, true);
  assert.equal(first.refundedMilli, 3_000);
  assert.equal(replay.applied, false);
  assert.equal(replay.refundedMilli, 0);
  assert.deepEqual(db.state, before);
  assert.equal(db.reservations.get(reservation.id)?.status, 'REFUNDED');
});

test('concurrent settle/refund attempts perform one transition only', async () => {
  const db = wallet({ aiIncludedCreditsMilli: 0, aiBonusCreditsMilli: 10_000, aiCredits: 10 });
  const reservation = await reserveAiCreditsMilliUpTo('user-1', 6_000, 8_000, db as any);
  const attempts = await Promise.all([
    settleAiCreditReservation(reservation, 2_000, db as any),
    refundAiCreditReservation(reservation, db as any),
    settleAiCreditReservation(reservation, 2_000, db as any)
  ]);
  assert.equal(attempts.filter(r => r.applied).length, 1);
  assert.equal(attempts.filter(r => !r.applied).length, 2);
  assert.equal(db.state?.aiBonusCreditsMilli, 8_000);
  assert.equal(db.reservations.get(reservation.id)?.status, 'SETTLED');
  const retry = await settleAiCreditReservation(reservation, 1_000, db as any);
  assert.equal(retry.applied, false);
  assert.equal(db.state?.aiBonusCreditsMilli, 8_000);
});

test('refund after fully refunded settlement does not credit the wallet again', async () => {
  const db = wallet({ aiIncludedCreditsMilli: 8_000, aiBonusCreditsMilli: 0, aiCredits: 8 });
  const reservation = await reserveAiCreditsMilli('user-1', 5_000, db as any);
  const settled = await settleAiCreditReservation(reservation, 0, db as any);
  assert.equal(settled.refundedMilli, 5_000);
  assert.equal(settled.applied, true);
  const replay = await refundAiCreditReservation(reservation, db as any);
  assert.equal(replay.applied, false);
  assert.equal(db.state?.aiIncludedCreditsMilli, 8_000);
});

test('unknown or another users reservation does not create credit', async () => {
  const db = wallet({ aiIncludedCreditsMilli: 5_000, aiCredits: 5 });
  const reservation = await reserveAiCreditsMilli('user-1', 2_000, db as any);
  await assert.rejects(refundAiCreditReservation({ ...reservation, id: 'forged' }, db as any), /reservation not found/);
  await assert.rejects(refundAiCreditReservation({ ...reservation, userId: 'another-user' }, db as any), /reservation not found/);
  assert.equal(db.state?.aiIncludedCreditsMilli, 3_000);
});

test('expired monthly included credit never reappears in a later month after refund', async () => {
  const db = wallet({
    aiIncludedCreditsMilli: 4_000, aiBonusCreditsMilli: 3_000,
    aiPurchasedCreditsMilli: 2_000, aiCredits: 9, subscriptionPlan: 'free'
  });
  const reservation = await reserveAiCreditsMilli('user-1', 8_000, db as any);
  // Simulate the reservation having been created in the previous month.
  // The current UTC clock remains real; refreshing the wallet must expire
  // its previous-period included allowance.
  const recorded = db.reservations.get(reservation.id)!;
  db.reservations.set(reservation.id, { ...recorded, period: '2000-01' });
  db.state = {
    ...db.state!, aiCreditsPeriod: '2000-01', aiIncludedCreditsMilli: 0,
    aiBonusCreditsMilli: 0, aiPurchasedCreditsMilli: 1_000, aiCredits: 1
  };
  const refunded = await refundAiCreditReservation(reservation, db as any);
  assert.equal(refunded.expiredIncludedMilli, 4_000);
  assert.equal(refunded.refundedMilli, 4_000);
  assert.equal(db.state?.aiIncludedCreditsMilli, 0);
  assert.equal(db.state?.aiBonusCreditsMilli, 3_000);
  assert.equal(db.state?.aiPurchasedCreditsMilli, 2_000);
});

test('reservation migration has database-level identity, balance constraints and foreign key', async () => {
  const sql = await readFile(new URL('../prisma/migrations/20261013103000_ai_credit_reservation_ledger/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /PRIMARY KEY \("id"\)/);
  assert.match(sql, /"totalMilli" = "includedMilli" \+ "bonusMilli" \+ "purchasedMilli"/);
  assert.match(sql, /ON DELETE CASCADE/);
});
