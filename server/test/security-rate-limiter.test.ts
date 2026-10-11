import assert from 'node:assert/strict';
import test from 'node:test';
import { FixedWindowRateLimiter } from '../src/lib/security-rate-limiter.js';

test('accepts configured attempts and then rejects with Retry-After', () => {
  let now = 1000;
  const limiter = new FixedWindowRateLimiter(2, 10_000, 20, () => now);
  assert.deepEqual(limiter.consume('one'), { allowed: true, retryAfterSeconds: 0 });
  assert.deepEqual(limiter.consume('one'), { allowed: true, retryAfterSeconds: 0 });
  assert.deepEqual(limiter.consume('one'), { allowed: false, retryAfterSeconds: 10 });
  now += 2_500;
  assert.deepEqual(limiter.inspect('one'), { allowed: false, retryAfterSeconds: 8 });
  now += 7_500;
  assert.deepEqual(limiter.consume('one'), { allowed: true, retryAfterSeconds: 0 });
});

test('different identities are isolated and successful authentication may reset a bucket', () => {
  const limiter = new FixedWindowRateLimiter(1, 60_000);
  assert.equal(limiter.consume('account:a').allowed, true);
  assert.equal(limiter.consume('account:a').allowed, false);
  assert.equal(limiter.consume('account:b').allowed, true);
  limiter.reset('account:a');
  assert.equal(limiter.consume('account:a').allowed, true);
});

test('bounded memory prunes expired entries before adding new identities', () => {
  let now = 0;
  const limiter = new FixedWindowRateLimiter(1, 1000, 2, () => now);
  limiter.consume('a');
  limiter.consume('b');
  now = 2000;
  assert.equal(limiter.consume('c').allowed, true);
  assert.equal(limiter.consume('a').allowed, true);
});

test('invalid configuration is rejected', () => {
  assert.throws(() => new FixedWindowRateLimiter(0, 10));
  assert.throws(() => new FixedWindowRateLimiter(10, 0));
  assert.throws(() => new FixedWindowRateLimiter(10, 100, 0));
});
