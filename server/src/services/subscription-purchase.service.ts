import { enqueueSubscriptionWelcome } from './subscription-welcome.service.js';
import { Prisma, type SubscriptionPurchase } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { getSubscriptionPlanByKey, subscriptionEndDate } from '../config/subscription-plans.js';
import { parseProviderAmountKopecks, type YooKassaPayment } from './yookassa.service.js';

export type SubscriptionReconcileResult = {
  outcome: 'succeeded' | 'canceled' | 'pending' | 'ignored';
  purchase: SubscriptionPurchase | null;
};

export async function reconcileSubscriptionPurchaseFromYooKassa(
  payment: YooKassaPayment, expectedPurchaseId?: string, db: typeof prisma = prisma
): Promise<SubscriptionReconcileResult> {
  const metadataId = payment.metadata?.subscription_purchase_id;
  let purchase = expectedPurchaseId
    ? await db.subscriptionPurchase.findUnique({ where: { id: expectedPurchaseId } })
    : await db.subscriptionPurchase.findUnique({ where: { yookassaPaymentId: payment.id } });
  if (!purchase && metadataId) purchase = await db.subscriptionPurchase.findUnique({ where: { id: metadataId } });
  if (!purchase) return { outcome: 'ignored', purchase: null };
  const plan = getSubscriptionPlanByKey(purchase.planKey);
  const amount = parseProviderAmountKopecks(payment.amount?.value);
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const verified = Boolean(plan)
    && (!purchase.yookassaPaymentId || purchase.yookassaPaymentId === payment.id)
    && purchase.currency === 'RUB' && payment.amount?.currency === 'RUB'
    && amount === purchase.amountKopecks
    && metadataId === purchase.id
    && payment.metadata?.subscription_plan_key === purchase.planKey
    && (!payment.recipient?.account_id || payment.recipient.account_id === shopId);
  if (!verified) {
    console.warn('[Payments] Subscription verification mismatch', { purchaseId: purchase.id, providerPaymentId: payment.id });
    return { outcome: 'ignored', purchase };
  }
  if (payment.status === 'canceled') {
    const updated = await db.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT 1::integer AS locked FROM pg_advisory_xact_lock(hashtext(${purchase!.id}))`);
      const current = await tx.subscriptionPurchase.findUnique({ where: { id: purchase!.id } });
      if (!current || current.activatedAt) return current;
      return tx.subscriptionPurchase.update({ where: { id: current.id }, data: {
        yookassaPaymentId: payment.id, status: 'canceled', providerStatus: 'canceled',
        providerCheckedAt: new Date(), canceledAt: current.canceledAt ?? new Date()
      } });
    });
    return { outcome: 'canceled', purchase: updated };
  }
  if (payment.status !== 'succeeded' || payment.paid !== true) {
    // Never downgrade an already activated purchase on a delayed pending notification.
    if (purchase.activatedAt) return { outcome: 'succeeded', purchase };
    const updated = await db.subscriptionPurchase.update({ where: { id: purchase.id }, data: {
      yookassaPaymentId: payment.id, providerStatus: payment.status, providerCheckedAt: new Date(),
      status: payment.status === 'pending' ? 'pending' : purchase.status
    } });
    return { outcome: 'pending', purchase: updated };
  }
  const updated = await db.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT 1::integer AS locked FROM pg_advisory_xact_lock(hashtext(${purchase!.id}))`);
    const current = await tx.subscriptionPurchase.findUnique({ where: { id: purchase!.id } });
    if (!current) throw new Error('Subscription purchase disappeared');
    if (current.activatedAt) return current;
    if (current.yookassaPaymentId && current.yookassaPaymentId !== payment.id) throw new Error('Payment ID changed during reconciliation');

    // Lock the wallet as AI debit/refund code does. Nothing is granted from webhook payloads.
    const users = await tx.$queryRaw<Array<{
      id: string; subscriptionPlan: string; subscriptionExpiresAt: Date | null; subscriptionAllowanceMilli: number; aiCreditsPeriod: string;
      aiIncludedCreditsMilli: number; aiBonusCreditsMilli: number; aiPurchasedCreditsMilli: number;
    }>>(Prisma.sql`SELECT "id", "subscriptionPlan", "subscriptionExpiresAt", "subscriptionAllowanceMilli", "aiCreditsPeriod",
      "aiIncludedCreditsMilli", "aiBonusCreditsMilli", "aiPurchasedCreditsMilli"
      FROM "User" WHERE "id" = ${current.userId} FOR UPDATE`);
    const user = users[0];
    if (!user) throw new Error('Subscription user disappeared');
    const now = new Date();
    const active = Boolean(user.subscriptionExpiresAt && user.subscriptionExpiresAt.getTime() > now.getTime());
    const termStart = active ? user.subscriptionExpiresAt! : now;
    const included = (active ? user.aiIncludedCreditsMilli : 0) + current.creditsMilli;
    const previousAllowance = user.subscriptionAllowanceMilli || (getSubscriptionPlanByKey(user.subscriptionPlan)?.creditsAmount ?? 0) * 1000;
    const allowance = (active ? previousAllowance : 0) + current.creditsMilli;
    // Existing bonus/purchased buckets never expire with the subscription.
    await tx.user.update({ where: { id: user.id }, data: {
      subscriptionPlan: current.planKey, subscriptionExpiresAt: subscriptionEndDate(termStart),
      aiCreditsPeriod: active ? user.aiCreditsPeriod : `subscription:${current.id}`,
      subscriptionAllowanceMilli: allowance,
      aiIncludedCreditsMilli: included,
      aiCredits: Math.floor((included + user.aiBonusCreditsMilli + user.aiPurchasedCreditsMilli) / 1000)
    } });
    await enqueueSubscriptionWelcome(tx, user.id, current.planKey, `purchase:${current.id}`);
    return tx.subscriptionPurchase.update({ where: { id: current.id }, data: {
      yookassaPaymentId: payment.id, status: 'succeeded', providerStatus: 'succeeded',
      providerCheckedAt: now, activatedAt: now
    } });
  });
  return { outcome: 'succeeded', purchase: updated };
}
