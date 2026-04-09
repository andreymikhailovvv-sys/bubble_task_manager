import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

export const AUTH_COOKIE_NAME = 'btm_auth';
export const DEVICE_COOKIE_NAME = 'btm_device';

export interface AuthTokenPayload {
  sub: string;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  googleSub?: string | null;
  deviceId?: string | null;
}

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required for authentication');
  }
  return secret;
};

const derivePasswordHash = (password: string, salt: string) => {
  return crypto.pbkdf2Sync(password, salt, 120_000, 64, 'sha512').toString('hex');
};

const hashPassword = (password: string) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = derivePasswordHash(password, salt);
  return `${salt}:${hash}`;
};

const verifyPassword = (password: string, storedHash: string) => {
  const [salt, originalHash] = storedHash.split(':');
  if (!salt || !originalHash) return false;
  const computed = derivePasswordHash(password, salt);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(originalHash));
};

const normalizeIp = (ip: string | undefined) => {
  if (!ip) return 'unknown-ip';
  return ip.includes('::ffff:') ? ip.replace('::ffff:', '') : ip;
};

const resolveDeviceId = (req: { cookies?: Record<string, string>; ip?: string; headers: Record<string, unknown> }) => {
  const existing = req.cookies?.[DEVICE_COOKIE_NAME];
  if (existing) return existing;

  const forwardedFor = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  const ip = normalizeIp(forwardedFor || req.ip);
  const userAgent = (req.headers['user-agent'] as string | undefined) ?? 'unknown-ua';

  return crypto.createHash('sha256').update(`${ip}|${userAgent}`).digest('hex');
};

export const authService = {
  sign(payload: AuthTokenPayload) {
    return jwt.sign(payload, getJwtSecret(), { expiresIn: '30d' });
  },
  verify(token: string) {
    return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
  },
  cookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/'
    };
  },
  deviceCookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 180 * 24 * 60 * 60 * 1000,
      path: '/'
    };
  },
  hashPassword,
  verifyPassword,
  resolveDeviceId
};
