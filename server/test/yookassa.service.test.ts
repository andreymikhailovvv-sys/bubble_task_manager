import assert from 'node:assert/strict';
import test from 'node:test';
import { CREDIT_PACKS, getCreditPackByKey } from '../src/config/credit-packs.js';
import { formatKopecks, parseProviderAmountKopecks, resolveReceiptEmail, YooKassaError, yookassaService } from '../src/services/yookassa.service.js';

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

test('createPayment sends a matching receipt for YooKassa receipts', async () => {
  const previousFetch = globalThis.fetch;
  const previousShopId = process.env.YOOKASSA_SHOP_ID;
  const previousSecretKey = process.env.YOOKASSA_SECRET_KEY;
  process.env.YOOKASSA_SHOP_ID = 'test-shop';
  process.env.YOOKASSA_SECRET_KEY = 'test-secret';
  let providerBody: Record<string, any> | undefined;
  globalThis.fetch = async (_url, init) => {
    providerBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: 'payment-1', status: 'pending', confirmation: { confirmation_url: 'https://yookassa.test/pay' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const payment = await yookassaService.createPayment({ amountKopecks: 19_900, returnUrl: 'https://example.test/return', description: 'Планировыч: 1800 AI-кредитов', receiptDescription: 'AI-кредиты Планировыч — 1800 кредитов', customerEmail: 'customer@example.com', purchaseId: 'purchase-1', creditPackKey: 'credit_start', idempotenceKey: 'idempotence-1' });
    assert.equal(payment.status, 'pending');
    assert.equal(payment.confirmation?.confirmation_url, 'https://yookassa.test/pay');
    assert.deepEqual(providerBody?.amount, { value: '199.00', currency: 'RUB' });
    assert.equal(providerBody?.receipt.customer.email, 'customer@example.com');
    assert.deepEqual(providerBody?.receipt.items[0].amount, providerBody?.amount);
    assert.equal(providerBody?.receipt.items[0].quantity, '1.000');
    assert.equal(providerBody?.receipt.items[0].vat_code, 1);
    assert.equal(providerBody?.receipt.items[0].payment_mode, 'full_payment');
    assert.equal(providerBody?.receipt.items[0].payment_subject, 'service');
    assert.equal(providerBody?.receipt.internet, true);
    assert.equal('tax_system_code' in providerBody!.receipt, false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousShopId === undefined) delete process.env.YOOKASSA_SHOP_ID; else process.env.YOOKASSA_SHOP_ID = previousShopId;
    if (previousSecretKey === undefined) delete process.env.YOOKASSA_SECRET_KEY; else process.env.YOOKASSA_SECRET_KEY = previousSecretKey;
  }
});

test('receipt email uses account email, username email, then validated request email', () => {
  assert.equal(resolveReceiptEmail({ email: ' User@Example.COM ', username: 'ignored@example.com' }, undefined), 'user@example.com');
  assert.equal(resolveReceiptEmail({ email: null, username: ' Login@Example.COM ' }, undefined), 'login@example.com');
  assert.equal(resolveReceiptEmail({ email: null, username: 'telegram-user' }, ' Receipt@Example.COM '), 'receipt@example.com');
  assert.equal(resolveReceiptEmail({ email: null, username: 'telegram-user' }, undefined), null);
  assert.equal(resolveReceiptEmail({ email: null, username: 'telegram-user' }, 'foo'), null);
});
