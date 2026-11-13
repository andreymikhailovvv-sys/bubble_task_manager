/**
 * Transactional account email. A profile email is NOT an identity until proven
 * by a token delivered to its mailbox. Tokens are single-use and stored hashed.
 */
import crypto from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { authService } from '../auth/auth.service.js';
import { smtpReply, emailAddress, MailSmtpError } from './mail-smtp.service.js';

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 6;
const PUBLIC_APP_URL = 'https://planirovych.ru';
const sha = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const validToken = (token: unknown): token is string =>
  typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);

export const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const address = value.trim().toLowerCase();
  return emailAddress(address) === address ? address : null;
};

/** Only variable names, never their values, may appear in diagnostics. */
export const accountMailConfigurationIssues = (): string[] => {
  const login = process.env.SMTP_USER?.trim().toLowerCase() ?? '';
  const issues: string[] = [];
  if (!login) issues.push('SMTP_USER_MISSING');
  else if (login !== 'no-reply@planirovych.ru') issues.push('SMTP_USER_SENDER_MISMATCH');
  if (!process.env.SMTP_PASSWORD?.trim()) issues.push('SMTP_PASSWORD_MISSING');
  return issues;
};
export const accountMailConfigured = () => accountMailConfigurationIssues().length === 0;

/** Diagnostics can be logged without ever emitting mailbox credentials, tokens or recipients. */
export const accountMailFailureDiagnostic = (error: unknown): string => {
  const config = accountMailConfigurationIssues();
  if (config.length) return 'configIssues=' + config.join(',');
  if (error instanceof MailSmtpError) {
    return 'smtpStage=' + error.stage + ' smtpCode=' + error.code +
      ' smtpStatus=' + (error.smtpStatus ?? 'none') + ' deliveryUncertain=' + error.deliveryUncertain;
  }
  return 'smtpStage=unknown type=' +
    (error instanceof Error && /^[A-Za-z]{1,50}$/.test(error.name) ? error.name : 'Unknown');
};

const verificationCodeHash = (id: string, userId: string, email: string, code: string): string => {
  const key = process.env.JWT_SECRET?.trim();
  if (!key) throw new Error('JWT_SECRET is required for verification codes');
  return crypto.createHmac('sha256', key).update([id, userId, email, code].join(':')).digest('hex');
};

/** Both link and code consume the SAME database challenge exactly once. */
const confirmVerification = async (input: { tokenHash?: string; userId?: string; code?: string }): Promise<boolean> => {
  const now = new Date();
  try {
    return await prisma.$transaction(async tx => {
      const token = input.tokenHash
        ? await tx.emailAuthToken.findUnique({ where: { tokenHash: input.tokenHash } })
        : await tx.emailAuthToken.findFirst({
            where: { userId: input.userId, purpose: 'VERIFY', usedAt: null, expiresAt: { gt: now } },
            orderBy: { createdAt: 'desc' }
          });
      if (!token || token.purpose !== 'VERIFY' || token.usedAt || token.expiresAt <= now) return false;
      if (input.code !== undefined) {
        if (!input.userId || token.userId !== input.userId || !token.codeHash ||
            !token.codeExpiresAt || token.codeExpiresAt <= now || token.codeAttempts >= MAX_CODE_ATTEMPTS) return false;
        const candidate = verificationCodeHash(token.id, token.userId, token.email, input.code);
        const matches = crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(token.codeHash, 'hex'));
        if (!matches) {
          // Persist failed attempts in PostgreSQL so limits hold across replicas/restarts.
          await tx.emailAuthToken.updateMany({ where: {
            id: token.id, usedAt: null, codeAttempts: { lt: MAX_CODE_ATTEMPTS }
          }, data: { codeAttempts: { increment: 1 } } });
          return false;
        }
      }
      const user = await tx.user.findUnique({ where: { id: token.userId }, select: {
        id: true, email: true, pendingEmail: true, emailVerifiedAt: true
      } });
      if (!user || !(user.pendingEmail === token.email ||
          (!user.emailVerifiedAt && user.email === token.email))) return false;
      const claimed = await tx.emailAuthToken.updateMany({ where: {
        id: token.id, usedAt: null, expiresAt: { gt: now }
      }, data: { usedAt: now } });
      if (claimed.count !== 1) return false;
      await tx.user.update({ where: { id: user.id }, data: {
        email: token.email, emailVerifiedAt: now, pendingEmail: null
      } });
      // A used link cannot leave behind a working code, or vice versa.
      await tx.emailAuthToken.deleteMany({ where: {
        userId: user.id, purpose: 'VERIFY', id: { not: token.id }
      } });
      return true;
    });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return false;
    throw error;
  }
};

const sendAccountMail = async (recipient: string, subject: string, text: string) => {
  if (!accountMailConfigured()) throw new Error('AUTH_MAIL_NOT_CONFIGURED');
  await smtpReply({
    provider: 'timeweb',
    email: process.env.SMTP_USER!.trim(),
    password: process.env.SMTP_PASSWORD!,
    from: recipient,
    subject,
    text,
    system: true
  });
};

const linkFor = (purpose: 'VERIFY' | 'RESET', token: string) =>
  `${PUBLIC_APP_URL}/auth/email?mode=${purpose === 'VERIFY' ? 'verify' : 'reset'}#token=${encodeURIComponent(token)}`;

export const accountEmailService = {
  normalizeEmail,
  accountMailConfigured,

  async requestVerification(userId: string): Promise<'SENT' | 'ALREADY_VERIFIED' | 'NO_EMAIL'> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: {
      email: true, emailVerifiedAt: true, pendingEmail: true
    } });
    if (!user) return 'NO_EMAIL';
    const destination = normalizeEmail(user.pendingEmail || (!user.emailVerifiedAt ? user.email : null));
    if (!destination) return user.emailVerifiedAt ? 'ALREADY_VERIFIED' : 'NO_EMAIL';
    if (!accountMailConfigured()) throw new Error('AUTH_MAIL_NOT_CONFIGURED');

    const token = newToken();
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const id = crypto.randomUUID();
    await prisma.$transaction(async tx => {
      await tx.emailAuthToken.deleteMany({ where: { userId, purpose: 'VERIFY' } });
      await tx.emailAuthToken.create({ data: {
        id, userId, purpose: 'VERIFY', email: destination, tokenHash: sha(token),
        codeHash: verificationCodeHash(id, userId, destination, code),
        codeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS)
      } });
    });
    await sendAccountMail(destination, 'Код и ссылка подтверждения почты Планировыча',
      `Здравствуйте!\n\nКод подтверждения почты Планировыча: ${code}\n\nВведите код в приложении в течение 15 минут.\n\nИли подтвердите адрес по ссылке:\n${linkFor('VERIFY', token)}\n\nСсылка действует 24 часа. Оба способа одноразовые: после подтверждения второй перестанет работать. Если вы не запрашивали подтверждение, проигнорируйте письмо.\n\nПланировыч AI\nhttps://planirovych.ru`);
    return 'SENT';
  },

  async verify(raw: unknown): Promise<boolean> {
    if (!validToken(raw)) return false;
    return confirmVerification({ tokenHash: sha(raw) });
  },

  async verifyCode(userId: string, rawCode: unknown): Promise<boolean> {
    if (typeof rawCode !== 'string' || !/^\d{6}$/.test(rawCode)) return false;
    return confirmVerification({ userId, code: rawCode });
  },

  /** Only a reminder: no confirmation credential is sent until the user requests it. */
  async sendLegacyVerificationReminder(userId: string, queuedEmail: string): Promise<'SENT' | 'SKIPPED'> {
    const destination = normalizeEmail(queuedEmail);
    if (!destination || !accountMailConfigured()) return 'SKIPPED';
    const user = await prisma.user.findUnique({ where: { id: userId }, select: {
      username: true, googleSub: true, email: true, pendingEmail: true, emailVerifiedAt: true
    } });
    if (!user || !(user.username || user.googleSub) || user.emailVerifiedAt) return 'SKIPPED';
    const currentEmail = normalizeEmail(user.pendingEmail || user.email);
    // Never contact a stale address when the account's email was changed.
    if (currentEmail !== destination) return 'SKIPPED';
    await sendAccountMail(destination, 'Подтвердите электронную почту в Планировыче',
      `Здравствуйте!\\n\\nВ вашем аккаунте Планировыча указан адрес электронной почты, который ещё не подтверждён.\\n\\nДля защиты аккаунта откройте https://planirovych.ru, войдите в свой аккаунт, перейдите в «Настройки аккаунта» и нажмите подтверждение почты. Вы сможете выбрать код из письма или ссылку активации.\\n\\nЕсли вы не создавали аккаунт или не указывали эту почту, ничего делать не нужно.\\n\\nПланировыч AI\\nhttps://planirovych.ru`);
    return 'SENT';
  },

  async requestPasswordReset(rawEmail: unknown): Promise<void> {
    const email = normalizeEmail(rawEmail);
    if (!email || !accountMailConfigured()) return;
    const user = await prisma.user.findUnique({ where: { email }, select: {
      id: true, passwordHash: true, emailVerifiedAt: true
    } });
    // Equal response for missing, unverified and Google-only accounts.
    if (!user?.passwordHash || !user.emailVerifiedAt) return;
    const token = newToken();
    await prisma.$transaction(async tx => {
      await tx.emailAuthToken.deleteMany({ where: { userId: user.id, purpose: 'RESET' } });
      await tx.emailAuthToken.create({ data: {
        userId: user.id, purpose: 'RESET', email, tokenHash: sha(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS)
      } });
    });
    await sendAccountMail(email, 'Восстановление пароля Планировыча',
      `Здравствуйте!\n\nДля смены пароля Планировыча откройте ссылку:\n${linkFor('RESET', token)}\n\nСсылка действует 30 минут и может использоваться только один раз. Если вы не запрашивали смену пароля, проигнорируйте письмо.\n\nПланировыч AI\nhttps://planirovych.ru`);
  },

  async resetPassword(rawToken: unknown, rawPassword: unknown): Promise<'SUCCESS' | 'INVALID' | 'SAME_PASSWORD'> {
    if (!validToken(rawToken) || typeof rawPassword !== 'string' ||
        rawPassword.length < 8 || rawPassword.length > 128) return 'INVALID';
    const hash = sha(rawToken);
    const now = new Date();
    return prisma.$transaction(async tx => {
      const token = await tx.emailAuthToken.findUnique({ where: { tokenHash: hash } });
      if (!token || token.purpose !== 'RESET' || token.usedAt || token.expiresAt <= now) return 'INVALID';
      const user = await tx.user.findUnique({ where: { id: token.userId }, select: {
        email: true, emailVerifiedAt: true, passwordHash: true
      } });
      if (!user?.emailVerifiedAt || !user.passwordHash || user.email !== token.email) return 'INVALID';
      // Check the existing PBKDF2 hash *before* making any changes. Do not burn
      // a still-valid reset link if the user accidentally submits the old password.
      if (authService.verifyPassword(rawPassword, user.passwordHash)) return 'SAME_PASSWORD';
      const passwordHash = authService.hashPassword(rawPassword);
      const used = await tx.emailAuthToken.updateMany({ where: {
        id: token.id, usedAt: null, expiresAt: { gt: now }
      }, data: { usedAt: now } });
      if (used.count !== 1) return 'INVALID';
      await tx.user.update({ where: { id: token.userId }, data: {
        passwordHash, passwordChangedAt: now, authVersion: { increment: 1 }
      } });
      await tx.emailAuthToken.deleteMany({ where: {
        userId: token.userId, purpose: 'RESET', id: { not: token.id }
      } });
      return 'SUCCESS';
    });

  }
};
