import type { AuthTokenPayload } from '../auth/auth.service.js';

declare global {
  namespace Express {
    interface User {
      id: string;
      email?: string | null;
      username?: string | null;
      name?: string | null;
      avatarUrl?: string | null;
      googleSub?: string | null;
      deviceId?: string | null;
    }

    interface Request {
      user?: User;
      authUser?: AuthTokenPayload;
      cookies?: Record<string, string>;
    }
  }
}

export {};
