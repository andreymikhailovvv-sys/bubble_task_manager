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
  reserveAiCreditsMilli
} from '../src/services/ai-credit-wallet.service.js';

type State = {
  id: string;
  aiCredits: number;
  aiCreditsPeriod: string;
  aiIncludedCreditsMilli: number;
  aiBonusCreditsMilli: number;
  aiPurchasedCreditsMilli: number;
};

class FakeWalletDatabase {
  private queue = Promise.resolve();
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
