import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isGuestAccount } from '../src/lib/guest-account.js';
import { formatAiRequestError, INSUFFICIENT_AI_CREDITS_MESSAGE } from '../../client/src/lib/api.js';

test('registration accepts guest upgrade from signed server credentials only', async () => {
  const src = await readFile(new URL('../src/routes/api.ts', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf("apiRouter.post('/auth/register'"), src.indexOf("apiRouter.post('/auth/login'"));
  assert.match(block, /authService\.resolveDeviceId\(req\)/);
  assert.match(block, /id: req\.user\.id, deviceId: verifiedGuestDeviceId/);
  assert.match(block, /guestUserId: guestUser\.id/);
  assert.doesNotMatch(block, /req\.body\.guestUserId/);
});

test('account conversion atomically checks guest and trial marker', async () => {
  const src = await readFile(new URL('../src/services/account-registration.service.ts', import.meta.url), 'utf8');
  assert.match(src, /input\.guestUserId && input\.verifiedGuestDeviceId/);
  assert.match(src, /aiTrialGrantedAt: null/);
  assert.match(src, /if \(upgraded\.count !== 1\)/);
  assert.match(src, /aiBonusCreditsMilli: \{ increment: creditsToMilli\(100\) \}/);
  assert.match(src, /await tx\.user\.findUniqueOrThrow/);
  assert.match(src, /aiIncludedCreditsMilli: 0/);
  assert.match(src, /aiTrialGrantedAt: now/);
});

test('migration marks existing registered users without modifying balances', async () => {
  const migration = await readFile(new URL('../prisma/migrations/20261012150000_one_time_ai_trial/migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /ADD COLUMN "aiTrialGrantedAt"/);
  assert.match(migration, /UPDATE "User"\s+SET "aiTrialGrantedAt" = NOW\(\)/);
  assert.doesNotMatch(migration, /SET "aiBonusCreditsMilli" =/);
  assert.doesNotMatch(migration, /SET "aiPurchasedCreditsMilli" =/);
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  assert.match(schema, /aiTrialGrantedAt DateTime\?/);
  assert.match(schema, /aiIncludedCreditsMilli Int @default\(0\)/);
});

test('guest becomes registered only on username/password attachment', () => {
  assert.equal(isGuestAccount({ deviceId: 'signed' }), true);
  assert.equal(isGuestAccount({ deviceId: 'signed', username: 'login', passwordHash: 'hash' }), false);
});

test('compact quick AI reports credit error in the original conversation', async () => {
  assert.equal(formatAiRequestError(new Error('Недостаточно AI кредитов')), INSUFFICIENT_AI_CREDITS_MESSAGE);
  assert.equal(formatAiRequestError(new Error('Недостаточно ИИ кредитов')), INSUFFICIENT_AI_CREDITS_MESSAGE);
  const src = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const quick = src.slice(src.indexOf('const sendAiChatQuestion = async'), src.indexOf('const openAiChatProjectDialog'));
  assert.match(quick, /const failureMessage: AiChatMessage/);
  assert.match(quick, /setAiChatError\(message\)/);
  assert.match(src, /if \(currentUser\?\.isGuest\) \{ setAuthError\(null\); setAuthModalMode\('register'\)/);
  const mini = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  assert.match(mini, /activeAiChat\?\.id === QUICK_AI_CHAT_ID/);
  assert.match(mini, /currentUser\?\.isGuest && isWebRuntime/);
});
