import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { prisma } from '../src/db/prisma.js';
import { setAdminSubscription, AdminSubscriptionError } from '../src/services/admin-subscription.service.js';
import { currentAiCreditsPeriod, getAiCreditWallet, reserveAiCreditsMilli, settleAiCreditReservation, refundAiCreditReservation } from '../src/services/ai-credit-wallet.service.js';
import { subscriptionEndDate } from '../src/config/subscription-plans.js';

test('admin grants are atomic, free, idempotent, audited and use the ordinary paid allowance', async () => {
  assert.ok(process.env.DATABASE_URL?.startsWith('postgresql://'));
  const now = new Date();
  const user = await prisma.user.create({ data: {
    email: 'admin-sub-test-'+randomUUID()+'@example.test',
    aiCreditsPeriod: currentAiCreditsPeriod(now),
    aiCredits: 150, aiBonusCreditsMilli: 100000, aiPurchasedCreditsMilli: 50000
  } });
  const guest = await prisma.user.create({ data: { deviceId: randomUUID() } });
  const read = () => prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const input = (u: typeof user, subscriptionPlan: string, requestId = randomUUID()) => ({
    userId: u.id, subscriptionPlan, requestId, expectedPeriod: u.aiCreditsPeriod,
    expectedPlan: u.subscriptionPlan, expectedExpiresAt: u.subscriptionExpiresAt?.toISOString() ?? null,
    reason: 'CI grant'
  });
  try {
    await assert.rejects(() => setAdminSubscription(input(guest, 'start')), (e: unknown) => e instanceof AdminSubscriptionError && e.status === 403);
    const first = input(user, 'start');
    const same = await Promise.all([setAdminSubscription(first, prisma, () => now), setAdminSubscription(first, prisma, () => now)]);
    assert.equal(same.filter(x => x.changed).length, 1);
    assert.equal(same.filter(x => x.replay).length, 1);
    const after = await read();
    assert.equal(after.subscriptionPlan, 'start');
    assert.equal(after.subscriptionExpiresAt?.toISOString(), subscriptionEndDate(now).toISOString());
    assert.equal(after.aiIncludedCreditsMilli, 3000000);
    assert.equal(after.aiCredits, 3150);
    assert.equal(await prisma.subscriptionPurchase.count({ where: { userId: user.id } }), 0);
    assert.equal(await prisma.adminSubscriptionChange.count({ where: { userId: user.id } }), 1);
    const spend = await reserveAiCreditsMilli(user.id, 300000);
    await settleAiCreditReservation(spend, 300000);
    assert.equal(await prisma.systemNotification.count({ where: { userId: user.id, eventKey: { startsWith: 'subscription-limit:' } } }), 1);
    const noRefill = await setAdminSubscription(input(await read(), 'start'));
    assert.equal(noRefill.changed, false);
    assert.equal(noRefill.user.aiIncludedCreditsMilli, 2700000);
    const reserved = await reserveAiCreditsMilli(user.id, 100000);
    const beforeReplace = await read();
    const competing = await Promise.allSettled([
      setAdminSubscription(input(beforeReplace, 'pro')),
      setAdminSubscription(input(beforeReplace, 'max'))
    ]);
    assert.equal(competing.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(competing.filter(x => x.status === 'rejected').length, 1);
    const replaced = await read();
    assert.ok(['pro','max'].includes(replaced.subscriptionPlan));
    assert.equal(replaced.aiIncludedCreditsMilli, replaced.subscriptionPlan === 'pro' ? 6000000 : 13000000);
    assert.notEqual(replaced.aiCreditsPeriod, reserved.period);
    const refunded = await refundAiCreditReservation(reserved);
    assert.equal(refunded.expiredIncludedMilli, 100000);
    assert.equal((await read()).aiIncludedCreditsMilli, replaced.aiIncludedCreditsMilli);
    const pending = await prisma.subscriptionPurchase.create({ data: {
      userId: user.id, clientRequestId: randomUUID(), idempotenceKey: randomUUID(),
      planKey: 'pro', creditsMilli: 6000000, amountKopecks: 59900, status: 'pending'
    } });
    const cancel = input(await read(), 'free');
    await assert.rejects(() => setAdminSubscription(cancel), (e: unknown) => e instanceof AdminSubscriptionError && e.status === 409);
    await prisma.subscriptionPurchase.update({ where: { id: pending.id }, data: { status: 'canceled' } });
    const inFlight = await reserveAiCreditsMilli(user.id, 100000);
    await setAdminSubscription(cancel);
    const cancelled = await getAiCreditWallet(user.id);
    assert.equal(cancelled.subscriptionPlan, 'free');
    assert.equal(cancelled.subscriptionExpiresAt, null);
    assert.equal(cancelled.aiIncludedCreditsMilli, 0);
    assert.equal(cancelled.aiBonusCreditsMilli, 100000);
    assert.equal(cancelled.aiPurchasedCreditsMilli, 50000);
    assert.equal((await refundAiCreditReservation(inFlight)).expiredIncludedMilli, 100000);
    assert.equal((await read()).aiCredits, 150);
    assert.equal((await setAdminSubscription(first)).replay, true);
    assert.equal((await read()).subscriptionPlan, 'free');
    const audit = await prisma.adminSubscriptionChange.findMany({ where: { userId: user.id } });
    assert.deepEqual(audit.map(x => x.action).sort(), ['cancel','grant','noop','replace']);
    assert.equal(audit.find(x => x.action === 'grant')?.reason, 'CI grant');
    // All three tariffs must use the same calendar and catalog, no custom admin amount.
    const max = await setAdminSubscription(input(await read(), 'max'), prisma, () => now);
    assert.equal(max.user.aiIncludedCreditsMilli, 13000000);
    assert.equal(max.user.subscriptionExpiresAt?.toISOString(), subscriptionEndDate(now).toISOString());
    await prisma.user.update({ where: { id: user.id }, data: { subscriptionExpiresAt: new Date(Date.now() - 1000) } });
    const expired = await getAiCreditWallet(user.id);
    assert.equal(expired.subscriptionPlan, 'free');
    assert.equal(expired.aiIncludedCreditsMilli, 0);
    assert.equal(expired.aiCredits, 150);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [user.id, guest.id] } } });
  }
});

test('admin subscription routes require the existing password guard before access', async () => {
  const source = await readFile(new URL('../src/routes/api.ts', import.meta.url), 'utf8');
  for (const route of ['subscription', 'subscription-history']) {
    const marker = "apiRouter.post('/admin/users/:userId/" + route + "'";
    const start = source.indexOf(marker);
    assert.ok(start >= 0);
    assert.match(source.slice(start,start+200), /if \(!requireAdminPassword\(req, res\)\) return;/);
  }
});
