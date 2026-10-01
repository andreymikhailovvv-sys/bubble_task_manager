import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCreditsSpent } from './credits.js';

test('форматирует фактически списанные милликредиты по-русски', () => {
  assert.equal(formatCreditsSpent(190), '0,19 кредита');
  assert.equal(formatCreditsSpent(1054), '1,05 кредита');
  assert.equal(formatCreditsSpent(2000), '2 кредита');
  assert.equal(formatCreditsSpent(5000), '5 кредитов');
  assert.equal(formatCreditsSpent(593), '0,59 кредита');
  assert.equal(formatCreditsSpent(1), '<0,01 кредита');
});
