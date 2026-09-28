import { Prisma } from '@prisma/client';
import { authService } from '../auth/auth.service.js';
import { prisma } from '../db/prisma.js';
import { onboardingService } from './onboarding.service.js';

export const normalizeAccountLogin = (value: string) => value.trim().toLowerCase();

export class AccountRegistrationError extends Error {
  constructor(public readonly code: 'INVALID_LOGIN' | 'INVALID_PASSWORD' | 'LOGIN_TAKEN' | 'CONSENT_REQUIRED') {
    super(code);
  }
}

export const PERSONAL_DATA_CONSENT_VERSION = '2026-09-28';

export const validatePersonalDataConsent = (value: unknown) => {
  if (value !== true) throw new AccountRegistrationError('CONSENT_REQUIRED');
};

export const validateAccountLogin = (value: string) => {
  const login = normalizeAccountLogin(value);
  if (login.length < 3) throw new AccountRegistrationError('INVALID_LOGIN');
  return login;
};

export const validateAccountPassword = (value: string) => {
  if (value.length < 6) throw new AccountRegistrationError('INVALID_PASSWORD');
  return value;
};

export const accountRegistrationService = {
  async isLoginAvailable(login: string) {
    return !(await prisma.user.findUnique({ where: { username: login }, select: { id: true } }));
  },

  async register(input: {
    login: string;
    password?: string;
    passwordHash?: string;
    name: string;
    telegramChatId?: string;
    personalDataConsent?: { version: string; ipAddress?: string };
  }) {
    const login = validateAccountLogin(input.login);
    if (!input.passwordHash) validateAccountPassword(input.password ?? '');
    const passwordHash = input.passwordHash ?? authService.hashPassword(input.password as string);

    try {
      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            username: login,
            passwordHash,
            name: input.name.trim() || login,
            ...(input.telegramChatId ? { telegramChatId: input.telegramChatId, telegramLinkedAt: new Date() } : {})
          }
        });
        if (input.personalDataConsent) {
          await tx.userConsent.create({
            data: {
              userId: user.id,
              type: 'PERSONAL_DATA_PROCESSING',
              version: input.personalDataConsent.version,
              ipAddress: input.personalDataConsent.ipAddress
            }
          });
        }
        await onboardingService.ensureDefaultsForNewUser(user.id, user.createdAt, tx);
        return user;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AccountRegistrationError('LOGIN_TAKEN');
      }
      throw error;
    }
  }
};
