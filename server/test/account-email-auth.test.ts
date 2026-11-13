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
  assert.match(page, /accountRequest\('reset'/);
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

test('registration requires configured mail, while verification remains proof-based', () => {
  const api = read('../src/routes/api.ts');
  const registration = api.slice(api.indexOf("apiRouter.post('/auth/register'"), api.indexOf("apiRouter.post('/auth/login'"));
  assert.match(registration, /if \(!email\)/);
  assert.match(registration, /!accountEmailService\.accountMailConfigured\(\)/);
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


test('email verification and reset use a dedicated HTML entry, not workspace JS or CSS', () => {
  const vite = read('../../client/vite.config.ts');
  const html = read('../../client/auth-email.html');
  const entry = read('../../client/src/auth-email-entry.tsx');
  const page = read('../../client/src/AuthEmailPage.tsx');
  const server = read('../src/index.ts');
  assert.match(vite, /authEmail: fileURLToPath/);
  assert.match(html, /src\/auth-email-entry\.tsx/);
  assert.doesNotMatch(html, /src\/main\.tsx/);
  assert.doesNotMatch(entry, /\.\/App/);
  assert.doesNotMatch(entry, /\.\/MiniApp/);
  assert.doesNotMatch(page, /\.\/lib\/api/);
  assert.match(server, /app\.get\('\/auth\/email'/);
  assert.match(server, /auth-email\.html/);
});

test('password reset disallows the current password without consuming its token', () => {
  const service = read('../src/services/account-email.service.ts');
  const api = read('../src/routes/api.ts');
  const start = service.indexOf('async resetPassword(');
  const reset = service.slice(start);
  assert.match(reset, /authService\.verifyPassword\(rawPassword, user\.passwordHash\)/);
  assert.match(reset, /return 'SAME_PASSWORD'/);
  assert.ok(reset.indexOf("return 'SAME_PASSWORD'") < reset.indexOf('codeAttempts: { increment: 1 }') || reset.indexOf("return 'SAME_PASSWORD'") < reset.indexOf('await tx.emailAuthToken.updateMany'));
  assert.match(api, /Новый пароль должен отличаться от предыдущего/);
});

test('system warning for unverified accounts is deterministic and not a polling flood', () => {
  const api = read('../src/routes/api.ts');
  assert.match(api, /account-email-verification-required:/);
  assert.match(api, /systemNotification\.createMany/);
  assert.match(api, /skipDuplicates: true/);
  assert.match(api, /emailVerifiedAt/);
  assert.match(api, /настройки аккаунта/);
});

test('old-account verification outreach is snapshotted once and is not replayed', () => {
  const schema = read('../prisma/schema.prisma');
  const sql = read('../prisma/migrations/20261114102000_legacy_email_verification_outreach/migration.sql');
  const worker = read('../src/services/legacy-email-outreach.service.ts');
  assert.match(schema, /model EmailVerificationOutreach/);
  assert.match(sql, /INSERT INTO "EmailVerificationOutreach"/);
  assert.match(sql, /"emailVerifiedAt" IS NULL/);
  assert.match(sql, /ON CONFLICT \("userId"\) DO NOTHING/);
  assert.match(worker, /status: 'PENDING'/);
  assert.match(worker, /status: 'CLAIMED'/);
  assert.match(worker, /status: 'FAILED'/);
  assert.doesNotMatch(worker, /status: 'PENDING'.*data: \{ status: 'PENDING' \}/s);
});

test('delete account is under account profile and not general settings', () => {
  const desktop = read('../../client/src/App.tsx');
  const profile = desktop.indexOf('{isProfileModalOpen && hasAccount ? (');
  const del = desktop.indexOf('onClick={() => void deleteAccount()}');
  assert.ok(profile >= 0 && del > profile);
  assert.equal(desktop.split('onClick={() => void deleteAccount()}').length - 1, 1);
});

test('new password registrations cannot receive their trial before verifying a unique email', () => {
  const registration = read('../src/services/account-registration.service.ts');
  const mail = read('../src/services/account-email.service.ts');
  const schema = read('../prisma/schema.prisma');
  const migration = read('../prisma/migrations/20261114010000_defer_registration_trial_until_verified_email/migration.sql');
  const routes = read('../src/routes/api.ts');

  assert.match(registration, /if \(!email\) throw new AccountRegistrationError\('INVALID_EMAIL'\)/);
  assert.match(registration, /EMAIL_TAKEN/);
  assert.match(registration, /pendingEmail: email/);
  assert.match(registration, /trialCreditsPendingEmailVerification: true/);
  assert.match(registration, /aiCredits: 0/);
  assert.match(registration, /aiBonusCreditsMilli: 0/);
  assert.match(mail, /trialCreditsPendingEmailVerification: false/);
  assert.match(mail, /aiBonusCreditsMilli: \{ increment: creditsToMilli\(100\) \}/);
  assert.match(mail, /aiTrialGrantedAt: now/);
  assert.match(schema, /trialCreditsPendingEmailVerification Boolean @default\(false\)/);
  assert.match(migration, /DEFAULT false/);
  assert.match(routes, /Для регистрации необходимо указать корректную электронную почту/);
  assert.match(routes, /apiRouter.post\('\/auth\/telegram-web-register'/);
  assert.match(routes, /emailDelivery: 'SENT' \| 'FAILED'/);
});

test('email verification status sync is targeted and event-triggered, not polling', () => {
  const desktop = read('../../client/src/App.tsx');
  const compact = read('../../client/src/MiniApp.tsx');
  const linkPage = read('../../client/src/AuthEmailPage.tsx');
  const events = read('../../client/src/lib/account-email-status-events.ts');
  const api = read('../src/routes/api.ts');
  assert.match(desktop, /subscribeAccountEmailVerified/);
  assert.match(compact, /subscribeAccountEmailVerified/);
  assert.match(desktop, /getEmailVerificationStatus/);
  assert.match(compact, /getEmailVerificationStatus/);
  assert.match(desktop, /Почта подтверждена/);
  assert.match(compact, /Почта подтверждена/);
  assert.match(linkPage, /announceAccountEmailVerified/);
  assert.match(events, /BroadcastChannel/);
  assert.match(events, /window.addEventListener\('storage'/);
  assert.match(api, /apiRouter.get\('\/auth\/email\/status'/);
  assert.doesNotMatch(events, /setInterval/);
});

test('all browser email registration inputs are required and use autofill', () => {
  const desktop = read('../../client/src/App.tsx');
  const compact = read('../../client/src/MiniApp.tsx');
  const telegram = read('../../client/src/TelegramAuthPage.tsx');
  const api = read('../../client/src/lib/api.ts');
  assert.match(desktop, /Электронная почта \(обязательно\)/);
  assert.match(compact, /Электронная почта \(обязательно\)/);
  assert.match(telegram, /autoComplete="email" required/);
  assert.match(desktop, /autoComplete="email" name="email" required/);
  assert.match(compact, /autoComplete="email" name="email" required/);
  assert.match(api, /registerTelegramWeb: \(payload: \{ initData: string; login: string; email: string/);
});

test('native Android and Telegram bot flows cannot bypass required email', () => {
  const androidModel = read('../../android-app/app/src/main/java/ru/planirovych/app/data/model/Models.kt');
  const androidRepo = read('../../android-app/app/src/main/java/ru/planirovych/app/data/repository/WorkspaceRepository.kt');
  const androidViewModel = read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeViewModel.kt');
  const androidUi = read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeScreen.kt');
  const telegram = read('../src/services/telegram.service.ts');
  assert.match(androidModel, /RegisterRequest\(val login: String, val email: String/);
  assert.match(androidRepo, /RegisterRequest\(login,email,password/);
  assert.match(androidViewModel, /repository\.register\(login\.trim\(\), password, email\.trim\(\)/);
  assert.match(androidUi, /Электронная почта \(обязательно\)/);
  assert.match(telegram, /promptRegistrationInWebApp/);
  assert.doesNotMatch(telegram, /accountRegistrationService\.register/);
});
