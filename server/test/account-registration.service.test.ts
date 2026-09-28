import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AccountRegistrationError,
  normalizeAccountLogin,
  PERSONAL_DATA_CONSENT_VERSION,
  validateAccountLogin,
  validateAccountPassword,
  validatePersonalDataConsent
} from '../src/services/account-registration.service.js';

test('нормализует логин одинаково для веба и Telegram', () => {
  assert.equal(normalizeAccountLogin('  NewUser  '), 'newuser');
  assert.equal(validateAccountLogin('  NewUser  '), 'newuser');
});

test('требует явное согласие на обработку персональных данных', () => {
  assert.doesNotThrow(() => validatePersonalDataConsent(true));
  for (const value of [false, undefined, 'true', 1]) {
    assert.throws(
      () => validatePersonalDataConsent(value),
      (error) => error instanceof AccountRegistrationError && error.code === 'CONSENT_REQUIRED'
    );
  }
  assert.equal(PERSONAL_DATA_CONSENT_VERSION, '2026-09-28');
});

test('отклоняет слишком короткий логин', () => {
  assert.throws(
    () => validateAccountLogin('ab'),
    (error) => error instanceof AccountRegistrationError && error.code === 'INVALID_LOGIN'
  );
});

test('принимает пароль от шести символов и отклоняет короткий', () => {
  assert.equal(validateAccountPassword('123456'), '123456');
  assert.throws(
    () => validateAccountPassword('12345'),
    (error) => error instanceof AccountRegistrationError && error.code === 'INVALID_PASSWORD'
  );
});
