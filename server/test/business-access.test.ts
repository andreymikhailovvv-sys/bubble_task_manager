import test from 'node:test';
import assert from 'node:assert/strict';
import { isBusinessAdmin } from '../src/lib/business-admin-access.js';

test('Work administrator access is denied by default', () => {
  assert.equal(isBusinessAdmin('a', undefined), false);
  assert.equal(isBusinessAdmin('a', ''), false);
  assert.equal(isBusinessAdmin(undefined, 'a'), false);
});
test('Only explicitly allowed user IDs gain access', () => {
  assert.equal(isBusinessAdmin('a', ' a, b '), true);
  assert.equal(isBusinessAdmin('b', ' a, b '), true);
  assert.equal(isBusinessAdmin('other', ' a, b '), false);
  assert.equal(isBusinessAdmin('ab', 'a'), false);
});
