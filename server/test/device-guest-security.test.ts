import assert from 'node:assert/strict';
import test from 'node:test';
import { authService, DEVICE_COOKIE_NAME } from '../src/auth/auth.service.js';

function withTestJwtSecret(check: () => void) {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-only-device-cookie-key-with-sufficient-entropy-2026';
  try {
    check();
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
}

test('new anonymous device identities cannot collide by shared IP or User-Agent', () => {
  const first = authService.createDeviceId();
  const second = authService.createDeviceId();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.match(second, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
});

test('an unsigned or attacker-supplied legacy device cookie cannot restore a user', () => {
  withTestJwtSecret(() => {
    const legacyFingerprint = 'a'.repeat(64);
    assert.equal(authService.resolveDeviceId({ cookies: { [DEVICE_COOKIE_NAME]: legacyFingerprint } }), null);
    assert.equal(authService.resolveDeviceId({ cookies: { [DEVICE_COOKIE_NAME]: 'victim-device-id' } }), null);
    assert.equal(authService.resolveDeviceId({ cookies: {} }), null);
    assert.equal(authService.resolveDeviceId({}), null);
  });
});

test('signed device cookie survives JWT expiry without trusting user-controlled IDs', () => {
  withTestJwtSecret(() => {
    const id = authService.createDeviceId();
    const cookie = authService.signDeviceCookie(id);
    assert.ok(cookie);
    assert.equal(authService.verifyDeviceCookie(cookie), id);
    assert.equal(authService.resolveDeviceId({ cookies: { [DEVICE_COOKIE_NAME]: cookie } }), id);

    const otherId = authService.createDeviceId();
    const tampered = cookie!.replace(id === otherId ? 'v1.' : cookie!.split('.')[1], Buffer.from(otherId).toString('base64url'));
    assert.equal(authService.verifyDeviceCookie(tampered), null);
    assert.equal(authService.verifyDeviceCookie(cookie!.slice(0, -1) + (cookie!.endsWith('a') ? 'b' : 'a')), null);
  });
});

test('legacy guest with valid JWT can be upgraded to a signed device cookie', () => {
  withTestJwtSecret(() => {
    const legacyId = 'b'.repeat(64);
    const jwt = authService.sign({ sub: 'existing-guest-user-id', deviceId: legacyId });
    assert.equal(authService.verify(jwt).sub, 'existing-guest-user-id');
    assert.equal(authService.verifyDeviceCookie(authService.signDeviceCookie(legacyId)), legacyId);
    assert.equal(authService.verifyDeviceCookie(legacyId), null);
    assert.equal(authService.cookieOptions().httpOnly, true);
    assert.equal(authService.deviceCookieOptions().sameSite, 'lax');
  });
});
