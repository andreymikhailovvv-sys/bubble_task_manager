import { Prisma, type CreditPurchase } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { grantPurchasedCreditsMilliInTransaction } from './ai-credit-wallet.service.js';
import { parseProviderAmountKopecks, type YooKassaPayment } from './yookassa.service.js';

export type ReconcileResult = { outcome: 'succeeded' | 'canceled' | 'pending' | 'ignored'; purchase: CreditPurchase | null };

const securityMismatch = (purchaseId: string | undefined, paymentId: string, reason: string) => {
  console.warn('[Payments] YooKassa verification mismatch', { purchaseId, providerPaymentId: paymentId, reason });
};

export async function reconcileCreditPurchaseFromYooKassa(payment: YooKassaPayment, expectedPurchaseId?: string): Promise<ReconcileResult> {
  const metadataPurchaseId = payment.metadata?.purchase_id;
  let purchase = expectedPurchaseId
    ? await prisma.creditPurchase.findUnique({ where: { id: expectedPurchaseId } })
    : await prisma.creditPurchase.findUnique({ where: { yookassaPaymentId: payment.id } });
  if (!purchase && metadataPurchaseId) purchase = await prisma.creditPurchase.findUnique({ where: { id: metadataPurchaseId } });
  if (!purchase) {
    securityMismatch(metadataPurchaseId, payment.id, 'purchase_not_found');
    return { outcome: 'ignored', purchase: null };
  }

  const amountKopecks = parseProviderAmountKopecks(payment.amount?.value);
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const valid = (!purchase.yookassaPaymentId || purchase.yookassaPaymentId === payment.id)
    && payment.amount?.currency === 'RUB'
    && purchase.currency === 'RUB'
    && amountKopecks === purchase.amountKopecks
    && metadataPurchaseId === purchase.id
    && payment.metadata?.credit_pack_key === purchase.creditPackKey
    && (!payment.recipient?.account_id || payment.recipient.account_id === shopId);
  if (!valid) {
    securityMismatch(purchase.id, payment.id, 'payment_fields');
    return { outcome: 'ignored', purchase };
  }

  if (payment.status === 'canceled') {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${purchase!.id}))`);
      const current = await tx.creditPurchase.findUnique({ where: { id: purchase!.id } });
      if (!current || current.creditedAt) return current;
      return tx.creditPurchase.update({ where: { id: current.id }, data: { yookassaPaymentId: payment.id, status: 'canceled', providerStatus: 'canceled', providerCheckedAt: new Date(), canceledAt: current.canceledAt ?? new Date() } });
    });
    return { outcome: 'canceled', purchase: updated };
  }

  if (payment.status !== 'succeeded' || payment.paid !== true) {
    const updated = await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { yookassaPaymentId: payment.id, providerStatus: payment.status, providerCheckedAt: new Date(), status: payment.status === 'pending' ? 'pending' : purchase.status } });
    return { outcome: 'pending', purchase: updated };
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${purchase!.id}))`);
    const current = await tx.creditPurchase.findUnique({ where: { id: purchase!.id } });
    if (!current) throw new Error('Credit purchase disappeared');
    if (current.creditedAt) return current;
    if (current.yookassaPaymentId && current.yookassaPaymentId !== payment.id) throw new Error('Payment id changed during reconciliation');
    await grantPurchasedCreditsMilliInTransaction(current.userId, current.creditsMilli, tx);
    return tx.creditPurchase.update({ where: { id: current.id }, data: { yookassaPaymentId: payment.id, status: 'succeeded', providerStatus: 'succeeded', providerCheckedAt: new Date(), creditedAt: new Date() } });
  });
  if (updated?.creditedAt && !purchase.creditedAt) console.info('[Payments] AI credits purchased', { purchaseId: updated.id, userId: updated.userId, packKey: updated.creditPackKey, creditsMilli: updated.creditsMilli });
  return { outcome: 'succeeded', purchase: updated };
}
