import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('password recovery requires a verified mailbox and single-use hashed token', () => {
  const service = read('../src/services/account-email.service.ts');
  assert.match(service, /createHash\('sha256'\)/);
  assert.match(service, /randomBytes\(32\)/);
  assert.match(service, /emailVerifiedAt/);
  assert.match(service, /passwordHash/);
  assert.match(service, /usedAt: null/);
  assert.match(service, /authVersion: \{ increment: 1 \}/);
  assert.doesNotMatch(service, /console\.log\(.*token/i);
});

test('old profile emails stay unverified, including historical Google accounts', () => {
  const migration = read('../prisma/migrations/20261113220000_account_email_verification/migration.sql');
  assert.match(migration, /emailVerifiedAt/);
  assert.match(migration, /EmailAuthToken/);
  assert.doesNotMatch(migration, /UPDATE "User" SET "emailVerifiedAt"/);
  const profile = read('../src/routes/api.ts');
  assert.match(profile, /pendingEmail: emailRaw/);
  assert.match(profile, /findPasswordIdentity/);
  assert.match(profile, /byEmail\?\.emailVerifiedAt/);
});

test('recover endpoint has generic response and independent limits', () => {
  const api = read('../src/routes/api.ts');
  assert.match(api, /emailPasswordResetIpLimiter/);
  assert.match(api, /emailPasswordResetAccountLimiter/);
  assert.match(api, /Если подтверждённый адрес найден/);
  assert.match(api, /auth\/email\/forgot/);
  assert.match(api, /auth\/email\/reset/);
  const middleware = read('../src/middleware/auth.ts');
  assert.match(middleware, /authVersion !== \(authUser\.authVersion \?\? 0\)/);
});

test('Timeweb SMTP uses TLS with authenticated sender and no answer prefix for system mail', () => {
  const smtp = read('../src/services/mail-smtp.service.ts');
  assert.match(smtp, /timeweb: 'smtp\.timeweb\.ru'/);
  assert.match(smtp, /port: 465/);
  assert.match(smtp, /rejectUnauthorized: true/);
  assert.match(smtp, /input\.system/);
});

test('desktop and compact workspaces expose recovery and verification UI', () => {
  const desktop = read('../../client/src/App.tsx');
  const compact = read('../../client/src/MiniApp.tsx');
  const page = read('../../client/src/AuthEmailPage.tsx');
  assert.match(desktop, /Забыли пароль/);
  assert.match(desktop, /sendEmailVerification/);
  assert.match(compact, /Забыли пароль/);
  assert.match(compact, /saveAccountEmail/);
  assert.match(page, /api\.resetPassword/);
});
