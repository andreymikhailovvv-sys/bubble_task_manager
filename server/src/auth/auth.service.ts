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

// The device cookie is a long-lived *credential*, not a device fingerprint.
// Legacy unsigned btm_device values (including IP/User-Agent hashes) are untrusted.
const DEVICE_COOKIE_VERSION = 'v1';
const MAX_DEVICE_ID_BYTES = 128;
const DEVICE_COOKIE_PATTERN = /^v1\.([A-Za-z0-9_-]{1,171})\.([a-f0-9]{64})$/;

const deviceCookieSignature = (payload: string) =>
  crypto.createHmac('sha256', getJwtSecret()).update(`btm:device-cookie:${payload}`).digest('hex');

const signDeviceCookie = (deviceId: string): string | null => {
  const bytes = Buffer.from(deviceId, 'utf8');
  // Preserve existing device IDs when possible, without ever trusting them unsigned.
  if (bytes.length === 0 || bytes.length > MAX_DEVICE_ID_BYTES) return null;
  const payload = `${DEVICE_COOKIE_VERSION}.${bytes.toString('base64url')}`;
  return `${payload}.${deviceCookieSignature(payload)}`;
};

const verifyDeviceCookie = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length > 300) return null;
  const match = DEVICE_COOKIE_PATTERN.exec(value);
  if (!match) return null;

  const bytes = Buffer.from(match[1], 'base64url');
  if (bytes.length === 0 || bytes.length > MAX_DEVICE_ID_BYTES || bytes.toString('base64url') !== match[1]) return null;
  const deviceId = bytes.toString('utf8');
  if (!Buffer.from(deviceId, 'utf8').equals(bytes)) return null;

  const expected = Buffer.from(deviceCookieSignature(`${DEVICE_COOKIE_VERSION}.${match[1]}`), 'hex');
  if (!crypto.timingSafeEqual(expected, Buffer.from(match[2], 'hex'))) return null;
  return deviceId;
};

const createDeviceId = () => crypto.randomBytes(32).toString('hex');

const resolveDeviceId = (req: { cookies?: Record<string, string> }) =>
  verifyDeviceCookie(req.cookies?.[DEVICE_COOKIE_NAME]);

export const authService = {
  sign(payload: AuthTokenPayload) {
    return jwt.sign(payload, getJwtSecret(), { expiresIn: '30d' });
  },
  verify(token: string) {
    const payload = jwt.verify(token, getJwtSecret()) as Partial<AuthTokenPayload>;
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new Error('Invalid authentication token purpose');
    }
    return payload as AuthTokenPayload;
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
  createDeviceId,
  signDeviceCookie,
  verifyDeviceCookie,
  resolveDeviceId
};
