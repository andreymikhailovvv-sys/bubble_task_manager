import assert from 'node:assert/strict';
import test from 'node:test';
import { CREDIT_PACKS, getCreditPackByKey } from '../src/config/credit-packs.js';
import { formatKopecks, parseProviderAmountKopecks } from '../src/services/yookassa.service.js';

test('trusted credit pack configuration contains exact prices and credits', () => {
  assert.deepEqual(CREDIT_PACKS.map(({ key, creditsAmount, amountKopecks }) => ({ key, creditsAmount, amountKopecks })), [
    { key: 'credit_start', creditsAmount: 1800, amountKopecks: 19_900 },
    { key: 'credit_pro', creditsAmount: 6200, amountKopecks: 69_000 },
    { key: 'credit_max', creditsAmount: 14000, amountKopecks: 149_000 }
  ]);
  assert.equal(getCreditPackByKey('forged'), undefined);
});

test('kopecks are formatted and parsed without floating point arithmetic', () => {
  assert.equal(formatKopecks(19_900), '199.00');
  assert.equal(formatKopecks(69_000), '690.00');
  assert.equal(formatKopecks(149_000), '1490.00');
  assert.equal(parseProviderAmountKopecks('199.00'), 19_900);
  assert.equal(parseProviderAmountKopecks('1.00'), 100);
  assert.equal(parseProviderAmountKopecks('199.0'), null);
});
