import { type NextFunction, type Request, type Response } from 'express';
import { AUTH_COOKIE_NAME, authService } from '../auth/auth.service.js';
import { prisma } from '../db/prisma.js';

const authLogContext = (req: Request) => {
  const origin = req.get('origin') ?? 'no-origin';
  const host = req.get('host') ?? 'unknown-host';
  const forwardedHost = req.get('x-forwarded-host') ?? 'no-forwarded-host';
  return `method=${req.method} path=${req.originalUrl} host=${host} forwardedHost=${forwardedHost} origin=${origin}`;
};

export const authSession = async (req: Request, _res: Response, next: NextFunction) => {
  // Static assets and public pages must never pay for a database session lookup.
  if (!req.path.startsWith('/api/')) { next(); return; }
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) {
    req.user = undefined;
    if (req.originalUrl.startsWith('/api/auth/') || req.originalUrl === '/api/auth/me') {
      console.info(`[Auth] no auth cookie ${authLogContext(req)}`);
    }
    next();
    return;
  }

  try {
    const authUser = authService.verify(token);
    // Stored version makes a password reset invalidate all previous JWTs,
    // including tokens minted before this feature existed.
    const identity = await prisma.user.findUnique({
      where: { id: authUser.sub }, select: { authVersion: true }
    });
    if (!identity || identity.authVersion !== (authUser.authVersion ?? 0)) {
      req.user = undefined;
      next();
      return;
    }
    req.user = {
      id: authUser.sub,
      email: authUser.email,
      username: authUser.username,
      name: authUser.name,
      avatarUrl: authUser.avatarUrl,
      googleSub: authUser.googleSub,
      deviceId: authUser.deviceId
    };
  } catch (error) {
    req.user = undefined;
    console.warn(`[Auth] invalid auth cookie ${authLogContext(req)} error=${error instanceof Error ? error.message : String(error)}`);
  }

  next();
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    console.warn(`[Auth] unauthorized request ${authLogContext(req)}`);
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
};
