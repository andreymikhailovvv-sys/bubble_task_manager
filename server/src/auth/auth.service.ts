import jwt from 'jsonwebtoken';

export const AUTH_COOKIE_NAME = 'btm_auth';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  googleSub: string;
}

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required for authentication');
  }
  return secret;
};

export const authService = {
  sign(payload: AuthTokenPayload) {
    return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
  },
  verify(token: string) {
    return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
  },
  cookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    };
  }
};
