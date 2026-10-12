import crypto from 'node:crypto';

export const GOOGLE_OAUTH_STATE_COOKIE_NAME = 'btm_google_oauth_state';
export const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_STATE_PATTERN = /^([0-9a-z]{1,12})\.([A-Za-z0-9_-]{32})$/;

export const googleOAuthStateCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/auth/google/callback',
  maxAge: GOOGLE_OAUTH_STATE_TTL_MS
});

export const createGoogleOAuthState = (now = Date.now()) =>
  `${now.toString(36)}.${crypto.randomBytes(24).toString('base64url')}`;

// Neither query state nor client cookie alone is sufficient: both must match,
// and the value must have been created recently by this server's auth flow.
export const verifyGoogleOAuthState = (cookieValue: unknown, queryValue: unknown, now = Date.now()) => {
  if (typeof cookieValue !== 'string' || typeof queryValue !== 'string') return false;
  if (cookieValue.length > 100 || queryValue.length > 100) return false;
  const match = OAUTH_STATE_PATTERN.exec(queryValue);
  if (!match || !OAUTH_STATE_PATTERN.test(cookieValue)) return false;
  const createdAt = Number.parseInt(match[1], 36);
  if (!Number.isSafeInteger(createdAt) || createdAt > now + 60_000 || now - createdAt > GOOGLE_OAUTH_STATE_TTL_MS) return false;
  return crypto.timingSafeEqual(Buffer.from(queryValue), Buffer.from(cookieValue));
};

export const resolveVerifiedGoogleEmail = (profile: {
  emails?: Array<{ value?: unknown; verified?: unknown }>;
  _json?: { email?: unknown; email_verified?: unknown };
}): string | null => {
  const confirmedEmail = profile.emails?.find((item) => item.verified === true && typeof item.value === 'string')?.value;
  const jsonEmail = profile._json?.email_verified === true && typeof profile._json.email === 'string'
    ? profile._json.email
    : null;
  const email = typeof confirmedEmail === 'string' ? confirmedEmail : jsonEmail;
  const normalized = email?.trim().toLowerCase() ?? '';
  return normalized && normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized
    : null;
};

export class GoogleEmailConflictError extends Error {
  constructor() {
    super('An account with this email already exists and is not linked to this Google identity');
    this.name = 'GoogleEmailConflictError';
  }
}

export class GoogleEmailNotVerifiedError extends Error {
  constructor() {
    super('Google did not provide a verified email address');
    this.name = 'GoogleEmailNotVerifiedError';
  }
}
