import { prisma } from '../db/prisma.js';
import { reconcileSubscriptionPurchaseFromYooKassa } from './subscription-purchase.service.js';
import { yookassaService } from './yookassa.service.js';

/** Recover verified payments even if the browser closes and webhooks are missed. */
export async function reconcilePendingSubscriptionPurchases() {
  const throttleBefore = new Date(Date.now() - 60_000);
  const oldest = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.subscriptionPurchase.findMany({
    where: { status: 'pending', yookassaPaymentId: { not: null },
      createdAt: { gte: oldest },
      OR: [{ providerCheckedAt: null }, { providerCheckedAt: { lte: throttleBefore } }] },
    orderBy: [{ providerCheckedAt: 'asc' }, { createdAt: 'asc' }], take: 5,
    select: { id: true, yookassaPaymentId: true }
  });
  let scanned = 0, confirmed = 0, failed = 0;
  for (const purchase of candidates) {
    if (!purchase.yookassaPaymentId) continue;
    const claim = await prisma.subscriptionPurchase.updateMany({
      where: { id: purchase.id, status: 'pending', yookassaPaymentId: purchase.yookassaPaymentId,
        OR: [{ providerCheckedAt: null }, { providerCheckedAt: { lte: throttleBefore } }] },
      data: { providerCheckedAt: new Date() }
    });
    if (!claim.count) continue;
    scanned++;
    try {
      const verified = await yookassaService.getPayment(purchase.yookassaPaymentId);
      const result = await reconcileSubscriptionPurchaseFromYooKassa(verified, purchase.id);
      if (result.outcome === 'succeeded') confirmed++;
    } catch (error) {
      failed++;
      console.warn('[Payments] subscription recovery failed', {
        purchaseId: purchase.id, errorName: error instanceof Error ? error.name : 'unknown'
      });
    }
  }
  return { scanned, confirmed, failed };
}
