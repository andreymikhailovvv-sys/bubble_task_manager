import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AccountRegistrationError,
  normalizeAccountLogin,
  validateAccountLogin,
  validateAccountPassword
} from '../src/services/account-registration.service.js';

test('нормализует логин одинаково для веба и Telegram', () => {
  assert.equal(normalizeAccountLogin('  NewUser  '), 'newuser');
  assert.equal(validateAccountLogin('  NewUser  '), 'newuser');
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
