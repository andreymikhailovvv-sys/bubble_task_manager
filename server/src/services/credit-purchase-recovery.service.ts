import { prisma } from '../db/prisma.js';
import { reconcileCreditPurchaseFromYooKassa } from './credit-purchase.service.js';
import { YooKassaError, yookassaService, type YooKassaPayment } from './yookassa.service.js';

/**
 * Recheck unsettled purchases independently of browser polling and provider webhooks.
 * Only the YooKassa API response is authoritative; webhook bodies never grant credits.
 * providerCheckedAt is a cross-worker claim, and creditedAt guards exactly-once
 * wallet grants in reconcileCreditPurchaseFromYooKassa's locked transaction.
 */
export async function reconcilePendingCreditPurchases(
  db: typeof prisma = prisma,
  provider: Pick<typeof yookassaService, 'getPayment'> = yookassaService,
  reconcile: (payment: YooKassaPayment, purchaseId: string) => Promise<unknown> = reconcileCreditPurchaseFromYooKassa
): Promise<{ scanned: number; confirmed: number; failed: number }> {
  const now = Date.now();
  const throttleBefore = new Date(now - 60_000);
  const oldest = new Date(now - 30 * 24 * 60 * 60 * 1_000);
  const candidates = await db.creditPurchase.findMany({
    where: {
      status: 'pending',
      yookassaPaymentId: { not: null },
      createdAt: { gte: oldest },
      OR: [{ providerCheckedAt: null }, { providerCheckedAt: { lte: throttleBefore } }]
    },
    // Rotating by the oldest verification time prevents historical failed
    // purchases from starving newer paid purchases when take=5.
    orderBy: [{ providerCheckedAt: 'asc' }, { createdAt: 'asc' }],
    take: 5,
    select: { id: true, yookassaPaymentId: true }
  });
  let scanned = 0;
  let confirmed = 0;
  let failed = 0;
  for (const purchase of candidates) {
    if (!purchase.yookassaPaymentId) continue;
    // Do not duplicate requests on multi-replica deployments.
    const claimed = await db.creditPurchase.updateMany({
      where: {
        id: purchase.id, status: 'pending', yookassaPaymentId: purchase.yookassaPaymentId,
        OR: [{ providerCheckedAt: null }, { providerCheckedAt: { lte: throttleBefore } }]
      },
      data: { providerCheckedAt: new Date() }
    });
    if (!claimed.count) continue;
    scanned += 1;
    let step: 'provider_fetch' | 'credit_reconciliation' = 'provider_fetch';
    try {
      const payment = await provider.getPayment(purchase.yookassaPaymentId);
      step = 'credit_reconciliation';
      const result = await reconcile(payment, purchase.id) as { outcome?: string };
      if (result.outcome === 'succeeded') confirmed += 1;
    } catch (error) {
      failed += 1;
      console.warn('[Payments] pending purchase reconciliation retry failed', {
        purchaseId: purchase.id,
        step,
        errorName: error instanceof Error ? error.name : 'unknown',
        errorCode: error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          && /^P\\d{4}$/.test(error.code) ? error.code : undefined,
        failureKind: error instanceof YooKassaError ? error.failureKind : 'internal',
        networkCode: error instanceof YooKassaError ? error.networkCode : undefined,
        httpStatus: error instanceof YooKassaError ? error.httpStatus : undefined,
        providerCode: error instanceof YooKassaError ? error.providerCode : undefined,
        attempts: error instanceof YooKassaError ? error.attempts : undefined
      });
    }
  }
  return { scanned, confirmed, failed };
}
