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

test('a single verification email offers both code and URL with shared replay protection', () => {
  const service = read('../src/services/account-email.service.ts');
  const schema = read('../prisma/schema.prisma');
  const migration = read('../prisma/migrations/20261113232000_email_verification_code/migration.sql');
  assert.match(service, /randomInt\(0, 1_000_000\)/);
  assert.match(service, /codeExpiresAt: new Date/);
  assert.match(service, /createHmac\('sha256'/);
  assert.match(service, /timingSafeEqual/);
  assert.match(service, /MAX_CODE_ATTEMPTS = 6/);
  assert.match(service, /codeAttempts: \{ increment: 1 \}/);
  assert.match(service, /return confirmVerification\(\{ userId, code: rawCode \}\)/);
  assert.match(service, /return confirmVerification\(\{ tokenHash: sha\(raw\) \}\)/);
  assert.match(service, /Код и ссылка подтверждения почты/);
  assert.match(schema, /codeHash String\?/);
  assert.match(migration, /ADD COLUMN "codeHash"/);
  assert.match(migration, /ADD COLUMN "codeAttempts"/);
});

test('registration remains possible without mail secrets, but verification remains proof-based', () => {
  const api = read('../src/routes/api.ts');
  const registration = api.slice(api.indexOf("apiRouter.post('/auth/register'"), api.indexOf("apiRouter.post('/auth/login'"));
  assert.doesNotMatch(registration.slice(0, 1700), /if \(email && !accountEmailService\.accountMailConfigured/);
  assert.match(registration, /emailDelivery = 'FAILED'/);
  assert.match(api, /auth\/email\/verify-code/);
  assert.match(api, /emailCodeAttemptLimiter/);
  assert.match(api, /accountMailConfigurationIssues/);
  assert.match(api, /accountMailFailureDiagnostic/);
  const service = read('../src/services/account-email.service.ts');
  assert.match(service, /SMTP_USER_MISSING/);
  assert.match(service, /SMTP_PASSWORD_MISSING/);
  assert.doesNotMatch(service, /console\.log\(.*password/i);
});

test('both desktop and compact activation expose a code input and link option', () => {
  const dialog = read('../../client/src/components/EmailVerificationDialog.tsx');
  const desktop = read('../../client/src/App.tsx');
  const compact = read('../../client/src/MiniApp.tsx');
  assert.match(dialog, /autoComplete="one-time-code"/);
  assert.match(dialog, /api\.verifyEmailCode\(code\)/);
  assert.match(dialog, /Я перешёл по ссылке/);
  assert.match(dialog, /Отправить письмо ещё раз/);
  assert.match(desktop, /authModalMode === 'register' \? 'Логин'/);
  assert.match(compact, /authModalMode === 'register' \? 'Логин'/);
  assert.match(desktop, /EmailVerificationDialog/);
  assert.match(compact, /EmailVerificationDialog/);
});
