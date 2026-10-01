import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCreditsSpent } from '../src/services/ai-billing-notification.service.js';

test('server formatter matches the client credit format', () => {
  assert.equal(formatCreditsSpent(1), '<0,01 кредита');
  assert.equal(formatCreditsSpent(411), '0,41 кредита');
  assert.equal(formatCreditsSpent(378), '0,38 кредита');
  assert.equal(formatCreditsSpent(2478), '2,48 кредита');
  assert.equal(formatCreditsSpent(1000), '1 кредит');
  assert.equal(formatCreditsSpent(2000), '2 кредита');
});
