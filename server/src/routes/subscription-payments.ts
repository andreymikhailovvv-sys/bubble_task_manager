import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Router, type Request } from 'express';
import { getSubscriptionPlanByKey } from '../config/subscription-plans.js';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { reconcileSubscriptionPurchaseFromYooKassa } from '../services/subscription-purchase.service.js';
import { isYooKassaConfigured, resolveReceiptEmail, yookassaService } from '../services/yookassa.service.js';

export const subscriptionPaymentsRouter = Router();
class CheckoutConflict extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS_THROTTLE_MS = 10_000;

function publicOrigin(req: Request) {
  const configured = process.env.PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.protocol;
  return proto + '://' + req.get('host');
}

const publicSubscriptionPurchase = (purchase: {
  id: string; planKey: string; creditsMilli: number; amountKopecks: number;
  status: string; activatedAt: Date | null
}) => ({
  id: purchase.id, planKey: purchase.planKey, creditsAmount: purchase.creditsMilli / 1000,
  price: purchase.amountKopecks / 100, status: purchase.status, activated: Boolean(purchase.activatedAt)
});

subscriptionPaymentsRouter.post('/subscriptions/:planKey', requireAuth, async (req, res) => {
  const plan = getSubscriptionPlanByKey(String(req.params.planKey ?? ''));
  if (!plan) return void res.status(404).json({ error: 'Тариф не найден.' });
  const clientRequestId = String(req.body?.clientRequestId ?? '').trim();
  if (!REQUEST_ID_PATTERN.test(clientRequestId) || !['web', 'miniapp'].includes(req.body?.clientSurface)) {
    return void res.status(400).json({ error: 'Неверные параметры платежа.' });
  }
  if (!isYooKassaConfigured()) return void res.status(503).json({ error: 'Оплата временно недоступна.' });
  const user = await prisma.user.findUnique({ where: { id: req.user!.id },
    select: { id: true, username: true, email: true, googleSub: true, telegramChatId: true } });
  if (!user) return void res.status(401).json({ error: 'Unauthorized' });
  if (!user.username && !user.email && !user.googleSub && !user.telegramChatId) {
    return void res.status(403).json({ code: 'PAYMENT_ACCOUNT_REQUIRED', error: 'Для покупки подписки войдите или зарегистрируйтесь.' });
  }
  const customerEmail = resolveReceiptEmail(user, req.body?.receiptEmail);
  if (!customerEmail) return void res.status(400).json({ code: 'RECEIPT_EMAIL_REQUIRED', error: 'Укажите email для получения чека.' });

  let purchase = await prisma.subscriptionPurchase.findUnique({ where: {
    userId_clientRequestId: { userId: user.id, clientRequestId }
  } });
  if (purchase && purchase.planKey !== plan.key) return void res.status(409).json({ error: 'Идентификатор запроса уже использован.' });
  if (!purchase) {
    try {
      purchase = await prisma.$transaction(async (tx) => {
        // Checkout and activation take the same user row lock.
        const rows = await tx.$queryRaw<Array<{ subscriptionExpiresAt: Date | null }>>(
          Prisma.sql`SELECT "subscriptionExpiresAt" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`
        );
        if (rows[0]?.subscriptionExpiresAt && rows[0].subscriptionExpiresAt.getTime() > Date.now()) {
          throw new CheckoutConflict('SUBSCRIPTION_ACTIVE',
            'Подписка уже активна. Продлить её можно после окончания текущего периода.');
        }
        const unfinished = await tx.subscriptionPurchase.findFirst({
          where: { userId: user.id, status: { in: ['created', 'pending', 'create_failed'] } },
          select: { id: true }
        });
        if (unfinished) throw new CheckoutConflict('SUBSCRIPTION_PAYMENT_PENDING',
          'У вас уже есть незавершённая оплата. Дождитесь её проверки, не оплачивайте повторно.');
        return tx.subscriptionPurchase.create({ data: {
          userId: user.id, clientRequestId, planKey: plan.key,
          creditsMilli: plan.creditsAmount * 1000, amountKopecks: plan.amountKopecks,
          idempotenceKey: crypto.randomUUID()
        } });
      });
    } catch (error) {
      if (error instanceof CheckoutConflict) return void res.status(409).json({ code: error.code, error: error.message });
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      purchase = await prisma.subscriptionPurchase.findUnique({ where: {
        userId_clientRequestId: { userId: user.id, clientRequestId }
      } });
      if (!purchase) return void res.status(409).json({
        code: 'SUBSCRIPTION_PAYMENT_PENDING',
        error: 'У вас уже есть незавершённый платёж. Дождитесь его подтверждения.'
      });
    }
  }
  if (purchase.confirmationUrl || purchase.status === 'succeeded') {
    return void res.json({ purchaseId: purchase.id, status: purchase.status, confirmationUrl: purchase.confirmationUrl });
  }
  try {
    const payment = await yookassaService.createPayment({
      amountKopecks: purchase.amountKopecks,
      returnUrl: publicOrigin(req) + '/?payment=subscription&subscriptionPurchaseId=' + encodeURIComponent(purchase.id),
      description: 'Планировыч: подписка ' + plan.name + ' на месяц',
      receiptDescription: 'Подписка Планировыч ' + plan.name + ' на месяц',
      customerEmail, purchaseId: purchase.id, subscriptionPlanKey: purchase.planKey,
      idempotenceKey: purchase.idempotenceKey
    });
    purchase = await prisma.subscriptionPurchase.update({ where: { id: purchase.id }, data: {
      yookassaPaymentId: payment.id, providerStatus: payment.status, providerCheckedAt: new Date(),
      confirmationUrl: payment.confirmation?.confirmation_url ?? null,
      status: payment.status === 'canceled' ? 'canceled' : 'pending'
    } });
    if (payment.status === 'succeeded' && payment.paid === true) {
      purchase = (await reconcileSubscriptionPurchaseFromYooKassa(payment, purchase.id)).purchase ?? purchase;
    }
    console.info('[Payments] subscription payment created', {
      purchaseId: purchase.id, userId: user.id, planKey: purchase.planKey,
      providerPaymentId: payment.id, status: purchase.status
    });
    return void res.json({ purchaseId: purchase.id, status: purchase.status, confirmationUrl: purchase.confirmationUrl });
  } catch (error) {
    // The same clientRequestId and YooKassa idempotence key can safely retry an uncertain provider response.
    await prisma.subscriptionPurchase.update({ where: { id: purchase.id }, data: { status: 'create_failed' } });
    console.error('[Payments] subscription payment create failed', {
      purchaseId: purchase.id, errorName: error instanceof Error ? error.name : 'unknown'
    });
    return void res.status(502).json({ error: 'Не удалось создать платёж. Попробуйте ещё раз.' });
  }
});

subscriptionPaymentsRouter.get('/subscription-purchases/:purchaseId', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  let purchase = await prisma.subscriptionPurchase.findFirst({ where: {
    id: String(req.params.purchaseId), userId: req.user!.id
  } });
  if (!purchase) return void res.status(404).json({ error: 'Покупка не найдена.' });
  if (purchase.status === 'pending' && purchase.yookassaPaymentId &&
      (!purchase.providerCheckedAt || Date.now() - purchase.providerCheckedAt.getTime() >= STATUS_THROTTLE_MS)) {
    const claimed = await prisma.subscriptionPurchase.updateMany({ where: {
      id: purchase.id, status: 'pending',
      OR: [{ providerCheckedAt: null },
        { providerCheckedAt: { lte: new Date(Date.now() - STATUS_THROTTLE_MS) } }]
    }, data: { providerCheckedAt: new Date() } });
    if (claimed.count) {
      try {
        const verified = await yookassaService.getPayment(purchase.yookassaPaymentId);
        purchase = (await reconcileSubscriptionPurchaseFromYooKassa(verified, purchase.id)).purchase ?? purchase;
      } catch (error) {
        console.warn('[Payments] subscription status check failed', {
          purchaseId: purchase.id, errorName: error instanceof Error ? error.name : 'unknown'
        });
      }
    } else purchase = await prisma.subscriptionPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
  }
  return void res.json({ purchase: publicSubscriptionPurchase(purchase) });
});
