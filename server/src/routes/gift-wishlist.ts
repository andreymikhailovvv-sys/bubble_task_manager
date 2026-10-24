import { Router, type Request, type Response } from 'express';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { FixedWindowRateLimiter } from '../lib/security-rate-limiter.js';

// This anonymous API is intentionally separate from the planner's auth system.
// A unique database primary key is the lock: two visitors cannot claim one gift.
const giftIds = new Set(['map', 'camera', 'charger', 'bracelet', 'perfume', 'lip-oil']);
const tokenPattern = /^[a-f0-9]{64}$/;
const writesPerIp = new FixedWindowRateLimiter(24, 60 * 60 * 1000);

export const giftWishlistRouter = Router();

giftWishlistRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

giftWishlistRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const reservations = await prisma.giftWishlistReservation.findMany({
      select: { id: true }
    });
    res.json({ reservedIds: reservations.map((item) => item.id) });
  } catch (error) {
    console.error('[GiftWishlist] status fetch failed', error);
    res.status(503).json({ error: 'Не удалось обновить список подарков' });
  }
});

const validateMutation = (req: Request, res: Response): string | null => {
  if (!giftIds.has(req.params.giftId)) {
    res.status(404).json({ error: 'Подарок не найден' });
    return null;
  }

  // Reject cross-site mutation requests. Browser clients call this same origin.
  const origin = req.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== req.get('host')) {
        res.status(403).json({ error: 'Недопустимый источник запроса' });
        return null;
      }
    } catch {
      res.status(403).json({ error: 'Недопустимый источник запроса' });
      return null;
    }
  }

  const decision = writesPerIp.consume(req.ip || req.socket.remoteAddress || 'unknown');
  if (!decision.allowed) {
    res.setHeader('Retry-After', String(decision.retryAfterSeconds));
    res.status(429).json({ error: 'Слишком много изменений, попробуйте позже' });
    return null;
  }

  const token = req.body?.token;
  if (typeof token !== 'string' || !tokenPattern.test(token)) {
    res.status(400).json({ error: 'Некорректный ключ бронирования' });
    return null;
  }
  return createHash('sha256').update(token, 'utf8').digest('hex');
};

giftWishlistRouter.post('/:giftId/claim', async (req: Request, res: Response) => {
  const ownerTokenHash = validateMutation(req, res);
  if (!ownerTokenHash) return;
  const id = req.params.giftId;

  try {
    await prisma.giftWishlistReservation.create({ data: { id, ownerTokenHash } });
    res.status(201).json({ id, reserved: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // Idempotent retry after lost network response is safe for the same visitor.
      const existing = await prisma.giftWishlistReservation.findUnique({ where: { id } });
      if (existing?.ownerTokenHash === ownerTokenHash) {
        res.json({ id, reserved: true });
      } else {
        res.status(409).json({ error: 'Этот подарок уже выбрал другой гость' });
      }
      return;
    }
    console.error('[GiftWishlist] claim failed', error);
    res.status(503).json({ error: 'Не удалось сохранить выбор' });
  }
});

giftWishlistRouter.post('/:giftId/release', async (req: Request, res: Response) => {
  const ownerTokenHash = validateMutation(req, res);
  if (!ownerTokenHash) return;
  const id = req.params.giftId;

  try {
    const result = await prisma.giftWishlistReservation.deleteMany({
      where: { id, ownerTokenHash }
    });
    if (result.count === 1) {
      res.json({ id, reserved: false });
      return;
    }
    const exists = await prisma.giftWishlistReservation.findUnique({ where: { id }, select: { id: true } });
    res.status(exists ? 403 : 404).json({
      error: exists ? 'Снять бронь может только выбравший подарок гость' : 'Этот подарок уже свободен'
    });
  } catch (error) {
    console.error('[GiftWishlist] release failed', error);
    res.status(503).json({ error: 'Не удалось снять бронь' });
  }
});
