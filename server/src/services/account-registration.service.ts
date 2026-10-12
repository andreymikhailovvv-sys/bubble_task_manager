import { Prisma } from '@prisma/client';
import { authService } from '../auth/auth.service.js';
import { prisma } from '../db/prisma.js';
import { onboardingService } from './onboarding.service.js';
import { currentAiCreditsPeriod, creditsToMilli } from './ai-credit-wallet.service.js';

export const normalizeAccountLogin = (value: string) => value.trim().toLowerCase();

export class AccountRegistrationError extends Error {
  constructor(public readonly code: 'INVALID_LOGIN' | 'INVALID_PASSWORD' | 'LOGIN_TAKEN' | 'CONSENT_REQUIRED' | 'GUEST_SESSION_INVALID') {
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
    guestUserId?: string;
    verifiedGuestDeviceId?: string;
    personalDataConsent?: { version: string; ipAddress?: string };
  }) {
    const login = validateAccountLogin(input.login);
    if (!input.passwordHash) validateAccountPassword(input.password ?? '');
    const passwordHash = input.passwordHash ?? authService.hashPassword(input.password as string);

    try {
      return await prisma.$transaction(async (tx) => {
        const now = new Date();
        let user;
        if (input.guestUserId && input.verifiedGuestDeviceId) {
          // Only the server may set these fields, after checking BOTH a signed
          // guest JWT and a signed device cookie. Conditional UPDATE serializes
          // simultaneous requests and prevents a second trial grant.
          const upgraded = await tx.user.updateMany({
            where: {
              id: input.guestUserId,
              deviceId: input.verifiedGuestDeviceId,
              username: null,
              passwordHash: null,
              email: null,
              googleSub: null,
              telegramChatId: null,
              aiTrialGrantedAt: null
            },
            data: {
              username: login,
              passwordHash,
              name: input.name.trim() || login,
              aiTrialGrantedAt: now,
              aiCreditsPeriod: currentAiCreditsPeriod(now),
              aiIncludedCreditsMilli: 0,
              aiBonusCreditsMilli: { increment: creditsToMilli(100) },
              ...(input.telegramChatId ? { telegramChatId: input.telegramChatId, telegramLinkedAt: now } : {})
            }
          });
          if (upgraded.count !== 1) throw new AccountRegistrationError('GUEST_SESSION_INVALID');
          const activated = await tx.user.findUniqueOrThrow({ where: { id: input.guestUserId } });
          user = await tx.user.update({
            where: { id: activated.id },
            data: { aiCredits: Math.floor((activated.aiBonusCreditsMilli + activated.aiPurchasedCreditsMilli) / 1000) }
          });
        } else {
          user = await tx.user.create({
            data: {
              username: login,
              passwordHash,
              name: input.name.trim() || login,
              aiCredits: 100,
              aiIncludedCreditsMilli: 0,
              aiBonusCreditsMilli: creditsToMilli(100),
              aiCreditsPeriod: currentAiCreditsPeriod(now),
              aiTrialGrantedAt: now,
              ...(input.telegramChatId ? { telegramChatId: input.telegramChatId, telegramLinkedAt: now } : {})
            }
          });
        }
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
