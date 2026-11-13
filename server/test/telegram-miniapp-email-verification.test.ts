import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Telegram Mini App exposes account email settings to Telegram-only users', () => {
  const mini = read('../../client/src/MiniApp.tsx');
  const api = read('../src/routes/api.ts');
  assert.match(mini, /\(isWebRuntime \|\| isTelegramRuntime\) \? <div className="border-t/);
  assert.match(mini, /\|\| \(isTelegramRuntime && currentUser\?\.id\)/);
  assert.match(mini, /type="email" autoComplete="email" name="email"/);
  assert.match(mini, /onClick=\{\(\) => void saveAccountEmail\(\)\}/);
  assert.match(api, /user\.username \|\| user\.email \|\| user\.googleSub \|\| user\.telegramChatId/);
  assert.match(mini, /api\.updateProfile\(/);
  assert.match(mini, /api\.requestEmailVerification\(/);
});

test('Telegram Mini App can open and submit OTP dialog with no web-only guard', () => {
  const mini = read('../../client/src/MiniApp.tsx');
  const dialog = read('../../client/src/components/EmailVerificationDialog.tsx');
  assert.match(mini, /\{emailVerificationOpen && currentUser \? createPortal\(\(/);
  assert.doesNotMatch(mini, /\{isWebRuntime && emailVerificationOpen && currentUser/);
  assert.match(dialog, /api\.verifyEmailCode\(code\)/);
  assert.match(dialog, /api\.requestEmailVerification\(\)/);
  assert.match(dialog, /max-h-\[min\(86dvh,720px\)\]/);
  assert.match(mini, /setAccountEmailMessage\('Почта успешно подтверждена\.'\)/);
});

test('Mail link confirmation refreshes targeted account status on Telegram resume', () => {
  const mini = read('../../client/src/MiniApp.tsx');
  const link = read('../../client/src/AuthEmailPage.tsx');
  assert.match(mini, /subscribeAccountEmailVerified\(/);
  assert.match(mini, /api\.getEmailVerificationStatus\(/);
  assert.match(mini, /telegramWebApp\?\.onEvent\?\.\('activated', onFocus\)/);
  assert.match(mini, /window\.addEventListener\('focus', onFocus\)/);
  assert.match(mini, /document\.addEventListener\('visibilitychange', onVisible\)/);
  assert.match(mini, /setAiCredits\(status\.aiCredits\)/);
  assert.match(link, /announceAccountEmailVerified\(\)/);
  assert.doesNotMatch(mini.slice(mini.indexOf('const [emailVerificationNotice'), mini.indexOf('const [authPassword')), /setInterval/);
});

test('Telegram Mini App email flow leaves logout button disabled for bot session', () => {
  const mini = read('../../client/src/MiniApp.tsx');
  assert.match(mini, /\{isWebRuntime \? \(\s*<button type="button" className="surface-muted w-full rounded-xl/);
  assert.match(mini, /setEmailVerificationOpen\(true\)/);
  assert.match(mini, /Почта подтверждена/);
});
