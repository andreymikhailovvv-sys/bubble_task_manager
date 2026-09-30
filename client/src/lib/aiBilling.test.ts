import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAiCreditBalance, formatAiCreditsSpent } from './aiBilling.js';

test('formats charged credits without exposing millicredits', () => {
  assert.equal(formatAiCreditsSpent(1), '<0,1 кредита');
  assert.equal(formatAiCreditsSpent(4_164), '−4,2 кредита');
  assert.equal(formatAiCreditsSpent(100_600), '−101 кредитов');
});

test('formats total balance according to its size', () => {
  assert.equal(formatAiCreditBalance(98.44), '98,4');
  assert.match(formatAiCreditBalance(2456.789), /2.?457/);
});
