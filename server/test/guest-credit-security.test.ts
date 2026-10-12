import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isGuestAccount } from '../src/lib/guest-account.js';

test('guest identity only matches device-only sessions, never registered accounts', () => {
  assert.equal(isGuestAccount({ deviceId: 'signed-device-id' }), true);
  assert.equal(isGuestAccount({ deviceId: 'id', username: 'registered', passwordHash: 'hash' }), false);
  assert.equal(isGuestAccount({ deviceId: 'id', googleSub: 'verified-google-sub' }), false);
  assert.equal(isGuestAccount({ deviceId: 'id', telegramChatId: 'telegram-chat' }), false);
  assert.equal(isGuestAccount({ deviceId: null }), false);
});

test('device guest creation writes zero credits and the current accounting period', async () => {
  const src = await readFile(new URL('../src/routes/api.ts', import.meta.url), 'utf8');
  const start = src.indexOf('const ensureDeviceUser = async');
  const end = src.indexOf("apiRouter.get('/health'", start);
  const block = src.slice(start, end);
  assert.match(block, /aiCredits: 0,/);
  assert.match(block, /aiIncludedCreditsMilli: 0,/);
  assert.match(block, /aiBonusCreditsMilli: 0,/);
  assert.match(block, /aiPurchasedCreditsMilli: 0,/);
  assert.match(block, /aiCreditsPeriod: currentAiCreditsPeriod\(\)/);
});

test('all auth responses mask legacy guest balances and disclose guest status', async () => {
  const src = await readFile(new URL('../src/routes/api.ts', import.meta.url), 'utf8');
  assert.match(src, /const aiCreditsMilli = isGuestAccount\(user\) \? 0/);
  assert.match(src, /isGuest: isGuestAccount\(user\)/);
  const wallet = await readFile(new URL('../src/services/ai-credit-wallet.service.ts', import.meta.url), 'utf8');
  assert.match(wallet, /if \(isGuestAccount\(row\)\) return row/);
  assert.equal((wallet.match(/if \(isGuestAccount\(row\)\) throw new Error\('Недостаточно AI кредитов'\)/g) ?? []).length, 2);
});
