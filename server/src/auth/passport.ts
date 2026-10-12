import passport from 'passport';
import { Prisma } from '@prisma/client';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '../db/prisma.js';
import { onboardingService } from '../services/onboarding.service.js';
import { GoogleEmailConflictError, GoogleEmailNotVerifiedError, resolveVerifiedGoogleEmail } from '../lib/google-oauth-security.js';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL;

export const isGoogleAuthEnabled = Boolean(googleClientId && googleClientSecret && googleCallbackUrl);

if (isGoogleAuthEnabled) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: googleClientId as string,
        clientSecret: googleClientSecret as string,
        callbackURL: googleCallbackUrl as string
      },
      async (_accessToken: string, _refreshToken: string, profile: any, done: (error: Error | null, user?: any) => void) => {
        try {
          const googleSub = typeof profile?.id === 'string' ? profile.id.trim() : '';
          if (!googleSub) {
            done(new Error('Google profile does not include a stable subject'));
            return;
          }

          const email = resolveVerifiedGoogleEmail(profile);
          const displayName = String(profile.displayName || profile.name?.givenName || email || 'Пользователь Google');
          const avatarUrl = profile.photos?.[0]?.value ?? null;

          // Google subject is the identity. Never log into or attach an
          // unrelated account merely because the two email fields match.
          const existingUser = await prisma.user.findUnique({ where: { googleSub } });
          if (existingUser) {
            const emailOwner = email && email !== existingUser.email
              ? await prisma.user.findUnique({ where: { email }, select: { id: true } })
              : null;
            const user = await prisma.user.update({
              where: { id: existingUser.id },
              data: {
                name: displayName,
                avatarUrl,
                // Preserve the existing email when another user owns the new one.
                ...(email && (!emailOwner || emailOwner.id === existingUser.id) ? { email } : {})
              }
            });
            done(null, user);
            return;
          }

          if (!email) {
            done(new GoogleEmailNotVerifiedError());
            return;
          }

          const emailOwner = await prisma.user.findUnique({ where: { email }, select: { id: true } });
          if (emailOwner) {
            done(new GoogleEmailConflictError());
            return;
          }

          try {
            const user = await prisma.$transaction(async (tx) => {
              const createdUser = await tx.user.create({
                data: {
                  email,
                  googleSub,
                  name: displayName,
                  avatarUrl
                }
              });
              await onboardingService.ensureDefaultsForNewUser(createdUser.id, createdUser.createdAt, tx);
              return createdUser;
            });
            done(null, user);
          } catch (error) {
            // Handle only unique-constraint races as account conflicts.
            // Unrelated database failures must not be hidden as email collisions.
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
              throw error;
            }
            const matchingUser = await prisma.user.findUnique({ where: { googleSub } });
            if (matchingUser) {
              done(null, matchingUser);
              return;
            }
            done(new GoogleEmailConflictError());
          }
        } catch (error) {
          done(error as Error);
        }
      }
    )
  );
} else {
  console.warn('Google OAuth is disabled: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_CALLBACK_URL are not fully configured.');
}

export { passport };
