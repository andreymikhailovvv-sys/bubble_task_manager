import { Router, type Request, type Response } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { FixedWindowRateLimiter } from '../lib/security-rate-limiter.js';

/**
 * This small public router intentionally has no Planirovych user dependency.
 * Secrets are returned once to the reserving browser, never in the public list.
 * The unique giftId index arbitrates concurrent reservations across replicas.
 */
export const birthdayWishlistRouter = Router();
const GIFT_IDS = ['map', 'camera', 'charger', 'bracelet', 'black-orchid', 'lip-oil'] as const;
const availableIds: ReadonlySet<string> = new Set(GIFT_IDS);
const writeLimiter = new FixedWindowRateLimiter(30, 10 * 60 * 1000);
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

birthdayWishlistRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});

birthdayWishlistRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.birthdayWishlistReservation.findMany({
      where: { giftId: { in: [...GIFT_IDS] } },
      select: { giftId: true, id: true }
    });
    res.json({ reservations: rows });
  } catch (error) {
    console.error('[BirthdayWishlist] loading reservations failed', error);
    res.status(503).json({ error: 'Не удалось получить список подарков. Повторите позже.' });
  }
});

birthdayWishlistRouter.use('/:giftId', (req, res, next) => {
  if (!availableIds.has(req.params.giftId)) {
    res.status(404).json({ error: 'Подарок не найден' });
    return;
  }
  const limit = writeLimiter.consume(req.ip || req.socket.remoteAddress || 'unknown');
  if (!limit.allowed) {
    res.set('Retry-After', String(limit.retryAfterSeconds));
    res.status(429).json({ error: 'Слишком много попыток. Попробуйте позже.' });
    return;
  }
  next();
});

birthdayWishlistRouter.post('/:giftId/reserve', async (req: Request, res: Response) => {
  const token = randomBytes(32).toString('hex');
  try {
    const reservation = await prisma.birthdayWishlistReservation.create({
      data: { giftId: req.params.giftId, tokenHash: hashToken(token) },
      select: { id: true }
    });
    res.status(201).json({ reservationId: reservation.id, token });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Этот подарок уже выбрали.', code: 'GIFT_TAKEN' });
      return;
    }
    console.error('[BirthdayWishlist] reserving gift failed', error);
    res.status(503).json({ error: 'Не удалось сохранить выбор. Повторите позже.' });
  }
});

birthdayWishlistRouter.delete('/:giftId/reserve', async (req: Request, res: Response) => {
  const token = req.body?.token;
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
    res.status(400).json({ error: 'Для отмены нужно открыть тот же браузер, в котором сделан выбор.' });
    return;
  }
  try {
    const result = await prisma.birthdayWishlistReservation.deleteMany({
      where: { giftId: req.params.giftId, tokenHash: hashToken(token) }
    });
    if (result.count === 0) {
      res.status(409).json({ error: 'Бронирование изменилось. Обновите страницу.', code: 'NOT_OWNED' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('[BirthdayWishlist] releasing gift failed', error);
    res.status(503).json({ error: 'Не удалось отменить выбор. Повторите позже.' });
  }
});
