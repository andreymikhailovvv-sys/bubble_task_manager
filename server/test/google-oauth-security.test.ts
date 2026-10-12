import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGoogleOAuthState,
  googleOAuthStateCookieOptions,
  resolveVerifiedGoogleEmail,
  verifyGoogleOAuthState,
  GOOGLE_OAUTH_STATE_TTL_MS
} from '../src/lib/google-oauth-security.js';

test('OAuth state is random, cookie-matched and time-limited', () => {
  const now = 1_790_000_000_000;
  const first = createGoogleOAuthState(now);
  const second = createGoogleOAuthState(now);
  assert.notEqual(first, second);
  assert.equal(verifyGoogleOAuthState(first, first, now), true);
  assert.equal(verifyGoogleOAuthState(first, second, now), false);
  assert.equal(verifyGoogleOAuthState('attacker', first, now), false);
  assert.equal(verifyGoogleOAuthState(first, undefined, now), false);
  assert.equal(verifyGoogleOAuthState(first, first, now + GOOGLE_OAUTH_STATE_TTL_MS + 1), false);
  assert.equal(verifyGoogleOAuthState(first, first, now - 60_001), false);
  assert.equal(googleOAuthStateCookieOptions().httpOnly, true);
  assert.equal(googleOAuthStateCookieOptions().sameSite, 'lax');
  assert.equal(googleOAuthStateCookieOptions().path, '/api/auth/google/callback');
});

test('Google email must be explicitly verified and normalized', () => {
  assert.equal(resolveVerifiedGoogleEmail({ emails: [{ value: ' VIP@Example.COM ', verified: true }] }), 'vip@example.com');
  assert.equal(resolveVerifiedGoogleEmail({ emails: [{ value: 'vip@example.com', verified: false }] }), null);
  assert.equal(resolveVerifiedGoogleEmail({ emails: [{ value: 'vip@example.com' }] }), null);
  assert.equal(resolveVerifiedGoogleEmail({ emails: [{ value: 'vip@example.com', verified: false }], _json: { email: 'VIP@example.com', email_verified: true } }), 'vip@example.com');
  assert.equal(resolveVerifiedGoogleEmail({ _json: { email: 'vip@example.com', email_verified: false } }), null);
  assert.equal(resolveVerifiedGoogleEmail({}), null);
});
