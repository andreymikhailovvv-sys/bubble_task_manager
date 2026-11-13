/**
 * Transactional account email. A profile email is NOT an identity until proven
 * by a token delivered to its mailbox. Tokens are single-use and stored hashed.
 */
import crypto from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { authService } from '../auth/auth.service.js';
import { smtpReply, emailAddress } from './mail-smtp.service.js';

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
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

export const accountMailConfigured = () => {
  const login = process.env.SMTP_USER?.trim().toLowerCase();
  return Boolean(login && normalizeEmail(login) && process.env.SMTP_PASSWORD &&
    login === 'no-reply@planirovych.ru');
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
    await prisma.$transaction(async tx => {
      await tx.emailAuthToken.deleteMany({ where: { userId, purpose: 'VERIFY' } });
      await tx.emailAuthToken.create({ data: {
        userId, purpose: 'VERIFY', email: destination, tokenHash: sha(token),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS)
      } });
    });
    await sendAccountMail(destination, 'Подтверждение почты Планировыча',
      `Здравствуйте!\n\nЧтобы подтвердить адрес электронной почты в Планировыче, откройте ссылку:\n${linkFor('VERIFY', token)}\n\nСсылка действует 24 часа. Если вы не запрашивали подтверждение, проигнорируйте письмо.\n\nПланировыч AI\nhttps://planirovych.ru`);
    return 'SENT';
  },

  async verify(raw: unknown): Promise<boolean> {
    if (!validToken(raw)) return false;
    const hash = sha(raw);
    const now = new Date();
    try {
      return await prisma.$transaction(async tx => {
        const token = await tx.emailAuthToken.findUnique({ where: { tokenHash: hash } });
        if (!token || token.purpose !== 'VERIFY' || token.usedAt || token.expiresAt <= now) return false;
        const user = await tx.user.findUnique({ where: { id: token.userId }, select: {
          id: true, email: true, pendingEmail: true, emailVerifiedAt: true
        } });
        // The token may only confirm the address that is currently awaiting verification.
        if (!user || !(user.pendingEmail === token.email ||
            (!user.emailVerifiedAt && user.email === token.email))) return false;
        const claimed = await tx.emailAuthToken.updateMany({ where: {
          id: token.id, usedAt: null, expiresAt: { gt: now }
        }, data: { usedAt: now } });
        if (claimed.count !== 1) return false;
        await tx.user.update({ where: { id: user.id }, data: {
          email: token.email, emailVerifiedAt: now, pendingEmail: null
        } });
        await tx.emailAuthToken.deleteMany({ where: {
          userId: user.id, purpose: 'VERIFY', id: { not: token.id }
        } });
        return true;
      });
    } catch (error) {
      // Including a unique-email collision: never silently attach another user's email.
      if ((error as {code?: string})?.code === 'P2002') return false;
      throw error;
    }
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

  async resetPassword(rawToken: unknown, rawPassword: unknown): Promise<boolean> {
    if (!validToken(rawToken) || typeof rawPassword !== 'string' ||
        rawPassword.length < 8 || rawPassword.length > 128) return false;
    const hash = sha(rawToken);
    const now = new Date();
    const passwordHash = authService.hashPassword(rawPassword);
    return prisma.$transaction(async tx => {
      const token = await tx.emailAuthToken.findUnique({ where: { tokenHash: hash } });
      if (!token || token.purpose !== 'RESET' || token.usedAt || token.expiresAt <= now) return false;
      const user = await tx.user.findUnique({ where: { id: token.userId }, select: {
        email: true, emailVerifiedAt: true, passwordHash: true
      } });
      if (!user?.emailVerifiedAt || !user.passwordHash || user.email !== token.email) return false;
      const used = await tx.emailAuthToken.updateMany({ where: {
        id: token.id, usedAt: null, expiresAt: { gt: now }
      }, data: { usedAt: now } });
      if (used.count !== 1) return false;
      await tx.user.update({ where: { id: token.userId }, data: {
        passwordHash, passwordChangedAt: now, authVersion: { increment: 1 }
      } });
      await tx.emailAuthToken.deleteMany({ where: {
        userId: token.userId, purpose: 'RESET', id: { not: token.id }
      } });
      return true;
    });
  }
};
