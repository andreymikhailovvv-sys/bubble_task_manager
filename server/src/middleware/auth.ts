import { type NextFunction, type Request, type Response } from 'express';
import { AUTH_COOKIE_NAME, authService } from '../auth/auth.service.js';

export const authSession = (req: Request, _res: Response, next: NextFunction) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) {
    req.user = undefined;
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
  } catch {
    req.user = undefined;
  }

  next();
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
};
