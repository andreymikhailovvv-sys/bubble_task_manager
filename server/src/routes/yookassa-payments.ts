import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import { Prisma } from '@prisma/client';
import { CREDIT_PACKS, getCreditPackByKey } from '../config/credit-packs.js';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { reconcileCreditPurchaseFromYooKassa } from '../services/credit-purchase.service.js';
import { isYooKassaConfigured, YooKassaError, yookassaService } from '../services/yookassa.service.js';

export const yookassaPaymentsRouter = Router();
const CLIENT_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS_THROTTLE_MS = 10_000;

const publicOrigin = (req: Request) => {
  const configured = process.env.PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  return `${forwardedProto || req.protocol}://${req.get('host')}`;
};

const publicPurchase = (purchase: { id: string; creditPackKey: string; creditsAmount: number; amountKopecks: number; status: string; creditedAt: Date | null }) => ({
  id: purchase.id,
  creditPackKey: purchase.creditPackKey,
  creditsAmount: purchase.creditsAmount,
  price: purchase.amountKopecks / 100,
  status: purchase.status,
  credited: Boolean(purchase.creditedAt)
});

yookassaPaymentsRouter.post('/credit-packs/:packKey', requireAuth, async (req, res) => {
  const pack = getCreditPackByKey(String(req.params.packKey ?? ''));
  if (!pack) return void res.status(404).json({ error: 'Пакет кредитов не найден.' });
  const clientRequestId = String(req.body?.clientRequestId ?? '').trim();
  const clientSurface = req.body?.clientSurface;
  if (!CLIENT_REQUEST_ID_PATTERN.test(clientRequestId) || !['web', 'miniapp'].includes(clientSurface)) return void res.status(400).json({ error: 'Неверные параметры платежа.' });
  if (!isYooKassaConfigured()) return void res.status(503).json({ error: 'Оплата временно недоступна.' });

  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, username: true, email: true, googleSub: true, telegramChatId: true } });
  if (!user) return void res.status(401).json({ error: 'Unauthorized' });
  if (!user.username && !user.email && !user.googleSub && !user.telegramChatId) return void res.status(403).json({ code: 'PAYMENT_ACCOUNT_REQUIRED', error: 'Для покупки кредитов войдите или зарегистрируйтесь.' });
  const active = await prisma.creditPack.findUnique({ where: { key: pack.key }, select: { isActive: true } });
  if (active?.isActive === false) return void res.status(409).json({ error: 'Этот пакет временно недоступен.' });

  let purchase = await prisma.creditPurchase.findUnique({ where: { userId_clientRequestId: { userId: user.id, clientRequestId } } });
  if (purchase && purchase.creditPackKey !== pack.key) return void res.status(409).json({ error: 'Идентификатор запроса уже использован.' });
  if (!purchase) {
    try {
      purchase = await prisma.creditPurchase.create({ data: { userId: user.id, clientRequestId, creditPackKey: pack.key, creditsAmount: pack.creditsAmount, creditsMilli: pack.creditsAmount * 1000, amountKopecks: pack.amountKopecks, idempotenceKey: crypto.randomUUID() } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      purchase = await prisma.creditPurchase.findUniqueOrThrow({ where: { userId_clientRequestId: { userId: user.id, clientRequestId } } });
    }
  }
  if (purchase.confirmationUrl || purchase.status === 'succeeded') return void res.json({ purchaseId: purchase.id, status: purchase.status, confirmationUrl: purchase.confirmationUrl });

  try {
    const returnUrl = `${publicOrigin(req)}/?payment=return&purchaseId=${encodeURIComponent(purchase.id)}`;
    const providerPayment = await yookassaService.createPayment({ amountKopecks: purchase.amountKopecks, returnUrl, description: `Планировыч: ${purchase.creditsAmount} AI-кредитов`, purchaseId: purchase.id, creditPackKey: purchase.creditPackKey, idempotenceKey: purchase.idempotenceKey });
    purchase = await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { yookassaPaymentId: providerPayment.id, providerStatus: providerPayment.status, providerCheckedAt: new Date(), confirmationUrl: providerPayment.confirmation?.confirmation_url ?? null, status: providerPayment.status === 'canceled' ? 'canceled' : 'pending' } });
    if (providerPayment.status === 'succeeded' && providerPayment.paid === true) purchase = (await reconcileCreditPurchaseFromYooKassa(providerPayment, purchase.id)).purchase ?? purchase;
    console.info('[Payments] YooKassa payment created', { purchaseId: purchase.id, userId: purchase.userId, packKey: purchase.creditPackKey, providerPaymentId: providerPayment.id, amountKopecks: purchase.amountKopecks, status: purchase.status });
    return void res.json({ purchaseId: purchase.id, status: purchase.status, confirmationUrl: purchase.confirmationUrl });
  } catch (error) {
    await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { status: 'create_failed' } });
    console.error('[Payments] YooKassa create failed', { purchaseId: purchase.id, httpStatus: error instanceof YooKassaError ? error.httpStatus : undefined, providerCode: error instanceof YooKassaError ? error.providerCode : undefined });
    return void res.status(502).json({ error: 'Не удалось создать платёж. Попробуйте ещё раз.' });
  }
});

yookassaPaymentsRouter.post('/webhook', async (req, res) => {
  const event = typeof req.body?.event === 'string' ? req.body.event : '';
  if (!['payment.succeeded', 'payment.canceled'].includes(event)) return void res.json({ ok: true });
  const providerPaymentId = typeof req.body?.object?.id === 'string' ? req.body.object.id : '';
  if (!providerPaymentId || providerPaymentId.length > 100) return void res.json({ ok: true });
  try {
    const verified = await yookassaService.getPayment(providerPaymentId);
    const result = await reconcileCreditPurchaseFromYooKassa(verified);
    console.info('[Payments] YooKassa webhook', { event, providerPaymentId, purchaseId: result.purchase?.id });
    return void res.json({ ok: true });
  } catch (error) {
    console.error('[Payments] YooKassa webhook verification failed', { providerPaymentId, httpStatus: error instanceof YooKassaError ? error.httpStatus : undefined, providerCode: error instanceof YooKassaError ? error.providerCode : undefined });
    return void res.status(502).json({ error: 'Временная ошибка обработки платежа.' });
  }
});

yookassaPaymentsRouter.get('/purchases/:purchaseId', requireAuth, async (req, res) => {
  let purchase = await prisma.creditPurchase.findFirst({ where: { id: String(req.params.purchaseId), userId: req.user!.id } });
  if (!purchase) return void res.status(404).json({ error: 'Покупка не найдена.' });
  if (purchase.status === 'pending' && purchase.yookassaPaymentId && (!purchase.providerCheckedAt || Date.now() - purchase.providerCheckedAt.getTime() >= STATUS_THROTTLE_MS)) {
    const claimed = await prisma.creditPurchase.updateMany({ where: { id: purchase.id, status: 'pending', OR: [{ providerCheckedAt: null }, { providerCheckedAt: { lte: new Date(Date.now() - STATUS_THROTTLE_MS) } }] }, data: { providerCheckedAt: new Date() } });
    if (claimed.count) {
      try {
        const verified = await yookassaService.getPayment(purchase.yookassaPaymentId);
        purchase = (await reconcileCreditPurchaseFromYooKassa(verified, purchase.id)).purchase ?? purchase;
      } catch (error) {
        console.warn('[Payments] YooKassa status reconciliation failed', { purchaseId: purchase.id, httpStatus: error instanceof YooKassaError ? error.httpStatus : undefined });
      }
    } else purchase = await prisma.creditPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
  }
  return void res.json({ purchase: publicPurchase(purchase) });
});

export const creditPacksResponse = async () => {
  const stored = await prisma.creditPack.findMany({ where: { key: { in: CREDIT_PACKS.map((pack) => pack.key) } }, select: { key: true, isActive: true } });
  return { packs: CREDIT_PACKS.map(({ amountKopecks: _, ...pack }) => ({ ...pack, isActive: stored.find((item) => item.key === pack.key)?.isActive ?? true })), paymentProvider: isYooKassaConfigured() ? 'yookassa' as const : null, purchaseAvailable: isYooKassaConfigured() };
};
