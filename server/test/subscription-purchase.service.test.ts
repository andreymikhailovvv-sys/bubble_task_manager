import assert from 'node:assert/strict';
import test from 'node:test';
import { subscriptionEndDate } from '../src/config/subscription-plans.js';
import { reconcileSubscriptionPurchaseFromYooKassa } from '../src/services/subscription-purchase.service.js';

test('month boundaries clamp correctly, including leap years', () => {
  assert.equal(subscriptionEndDate(new Date('2026-01-31T09:30:00.000Z')).toISOString(), '2026-02-28T09:30:00.000Z');
  assert.equal(subscriptionEndDate(new Date('2028-01-31T09:30:00.000Z')).toISOString(), '2028-02-29T09:30:00.000Z');
});

test('verified payment activates a subscription once; duplicate webhooks do not repeat the grant', async () => {
  const purchase: Record<string, any> = {
    id: 'sub-123', userId: 'user-1', planKey: 'pro', creditsMilli: 6_000_000,
    amountKopecks: 59_900, currency: 'RUB', yookassaPaymentId: 'payment-1',
    status: 'pending', activatedAt: null
  };
  const user: Record<string, any> = {
    id: 'user-1', subscriptionPlan: 'free', subscriptionExpiresAt: null,
    aiIncludedCreditsMilli: 0, aiBonusCreditsMilli: 100_000, aiPurchasedCreditsMilli: 500_000
  };
  const notices: string[] = [];
  let userUpdates = 0;
  let locks = 0;
  const tx = {
    $queryRaw: async (query: { sql: string }) => {
      if (query.sql.includes('pg_advisory_xact_lock')) {
        locks++;
        assert.match(query.sql, /SELECT 1::integer AS locked/);
        return [{ locked: 1 }];
      }
      assert.match(query.sql, /FROM "User"/);
      return [{ ...user }];
    },
    systemNotification: { createMany: async ({data}: {data: Array<{eventKey:string}>}) => { notices.push(...data.map(item=>item.eventKey)); } },
    subscriptionPurchase: {
      findUnique: async () => ({ ...purchase }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(purchase, data);
        return { ...purchase };
      }
    },
    user: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        userUpdates++; Object.assign(user, data); return { ...user };
      }
    }
  };
  const db = {
    subscriptionPurchase: { findUnique: async () => ({ ...purchase }) },
    $transaction: async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const payment = { id: 'payment-1', status: 'succeeded', paid: true,
    amount: { value: '599.00', currency: 'RUB' },
    metadata: { subscription_purchase_id: 'sub-123', subscription_plan_key: 'pro' },
    recipient: { account_id: 'shop-1' } };
  const prior = process.env.YOOKASSA_SHOP_ID;
  process.env.YOOKASSA_SHOP_ID = 'shop-1';
  try {
    const first = await reconcileSubscriptionPurchaseFromYooKassa(payment, 'sub-123', db as any);
    assert.equal(first.outcome, 'succeeded');
    assert.equal(user.subscriptionPlan, 'pro');
    assert.equal(user.aiIncludedCreditsMilli, 6_000_000);
    assert.equal(user.aiCredits, 6_600);
    assert.ok(user.subscriptionExpiresAt instanceof Date);
    const second = await reconcileSubscriptionPurchaseFromYooKassa(payment, 'sub-123', db as any);
    assert.equal(second.outcome, 'succeeded');
    assert.equal(userUpdates, 1);
    assert.equal(locks, 2);
    assert.equal(notices.length,1);
    assert.equal(user.subscriptionAllowanceMilli,6000000);
    const previousExpiry = user.subscriptionExpiresAt;
    const previousPeriod = user.aiCreditsPeriod;
    user.aiIncludedCreditsMilli = 4500000;
    Object.assign(purchase,{id:'sub-124',planKey:'max',creditsMilli:13000000,amountKopecks:129000,yookassaPaymentId:'payment-2',status:'pending',activatedAt:null});
    const upgraded = {...payment,id:'payment-2',amount:{value:'1290.00',currency:'RUB'},metadata:{subscription_purchase_id:'sub-124',subscription_plan_key:'max'}};
    assert.equal((await reconcileSubscriptionPurchaseFromYooKassa(upgraded,'sub-124',db as any)).outcome,'succeeded');
    assert.equal(user.subscriptionPlan,'max');
    assert.equal(user.aiIncludedCreditsMilli,17500000);
    assert.equal(user.subscriptionAllowanceMilli,19000000);
    assert.equal(user.aiCreditsPeriod,previousPeriod);
    assert.equal(user.subscriptionExpiresAt.toISOString(),subscriptionEndDate(previousExpiry).toISOString());
    assert.equal(user.aiCredits,18100);
    assert.equal(notices.length,2);
    await reconcileSubscriptionPurchaseFromYooKassa(upgraded,'sub-124',db as any);
    assert.equal(userUpdates,2);
    assert.equal(notices.length,2);
  } finally {
    if (prior === undefined) delete process.env.YOOKASSA_SHOP_ID;
    else process.env.YOOKASSA_SHOP_ID = prior;
  }
});

test('mismatched amount, plan and shop cannot activate a subscription', async () => {
  const purchase = {
    id: 'sub-123', userId: 'user-1', planKey: 'start', creditsMilli: 3_000_000,
    amountKopecks: 29_900, currency: 'RUB', yookassaPaymentId: 'payment-1', activatedAt: null
  };
  const db = { subscriptionPurchase: { findUnique: async () => purchase },
    $transaction: async () => { throw new Error('Unsafe activation'); } };
  const payment = {
    id: 'payment-1', status: 'succeeded', paid: true,
    amount: { value: '299.00', currency: 'RUB' },
    metadata: { subscription_purchase_id: 'sub-123', subscription_plan_key: 'start' },
    recipient: { account_id: 'shop-1' }
  };
  const prior = process.env.YOOKASSA_SHOP_ID;
  process.env.YOOKASSA_SHOP_ID = 'shop-1';
  try {
    for (const invalid of [
      { ...payment, amount: { value: '0.01', currency: 'RUB' } },
      { ...payment, metadata: { ...payment.metadata, subscription_plan_key: 'max' } },
      { ...payment, recipient: { account_id: 'other-shop' } }
    ]) {
      const result = await reconcileSubscriptionPurchaseFromYooKassa(invalid, 'sub-123', db as any);
      assert.equal(result.outcome, 'ignored');
    }
  } finally {
    if (prior === undefined) delete process.env.YOOKASSA_SHOP_ID;
    else process.env.YOOKASSA_SHOP_ID = prior;
  }
});
