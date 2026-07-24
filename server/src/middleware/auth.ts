import { type NextFunction, type Request, type Response } from 'express';
import { AUTH_COOKIE_NAME, authService } from '../auth/auth.service.js';

const authLogContext = (req: Request) => {
  const origin = req.get('origin') ?? 'no-origin';
  const host = req.get('host') ?? 'unknown-host';
  const forwardedHost = req.get('x-forwarded-host') ?? 'no-forwarded-host';
  return `method=${req.method} path=${req.originalUrl} host=${host} forwardedHost=${forwardedHost} origin=${origin}`;
};

export const authSession = (req: Request, _res: Response, next: NextFunction) => {
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
