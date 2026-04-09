import { type NextFunction, type Request, type Response } from 'express';
import { AUTH_COOKIE_NAME, authService } from '../auth/auth.service.js';

export const authMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) {
    next();
    return;
  }

  try {
    req.authUser = authService.verify(token);
  } catch {
    req.authUser = undefined;
  }

  next();
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.authUser) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
};
