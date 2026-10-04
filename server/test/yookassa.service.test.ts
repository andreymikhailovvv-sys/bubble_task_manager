import assert from 'node:assert/strict';
import test from 'node:test';
import { CREDIT_PACKS, getCreditPackByKey } from '../src/config/credit-packs.js';
import { formatKopecks, parseProviderAmountKopecks, YooKassaError, yookassaService } from '../src/services/yookassa.service.js';

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

test('YooKassa HTTP error exposes only sanitized diagnostic fields', async () => {
  const previousFetch = globalThis.fetch;
  const previousShopId = process.env.YOOKASSA_SHOP_ID;
  const previousSecretKey = process.env.YOOKASSA_SECRET_KEY;
  process.env.YOOKASSA_SHOP_ID = 'test-shop';
  process.env.YOOKASSA_SECRET_KEY = 'super-secret-key';
  globalThis.fetch = async () => new Response(JSON.stringify({
    type: 'error',
    id: 'test-error-id',
    code: 'invalid_request',
    description: 'Test provider description',
    parameter: 'receipt'
  }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    await assert.rejects(
      yookassaService.getPayment('test-payment-id'),
      (error: unknown) => {
        assert.ok(error instanceof YooKassaError);
        assert.equal(error.httpStatus, 400);
        assert.equal(error.providerCode, 'invalid_request');
        assert.equal(error.providerErrorId, 'test-error-id');
        assert.equal(error.providerDescription, 'Test provider description');
        assert.equal(error.providerParameter, 'receipt');
        assert.doesNotMatch(error.message, /Authorization|super-secret-key/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousShopId === undefined) delete process.env.YOOKASSA_SHOP_ID;
    else process.env.YOOKASSA_SHOP_ID = previousShopId;
    if (previousSecretKey === undefined) delete process.env.YOOKASSA_SECRET_KEY;
    else process.env.YOOKASSA_SECRET_KEY = previousSecretKey;
  }
});
