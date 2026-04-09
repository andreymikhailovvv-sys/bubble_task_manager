import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '../db/prisma.js';

const getRequiredEnv = (name: 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET' | 'GOOGLE_CALLBACK_URL') => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for Google OAuth`);
  }
  return value;
};

const resolveProfileEmail = (profile: any) =>
  profile.emails?.find((item: any) => item.verified)?.value ?? profile.emails?.[0]?.value ?? null;

passport.use(
  new GoogleStrategy(
    {
      clientID: getRequiredEnv('GOOGLE_CLIENT_ID'),
      clientSecret: getRequiredEnv('GOOGLE_CLIENT_SECRET'),
      callbackURL: getRequiredEnv('GOOGLE_CALLBACK_URL')
    },
    async (_accessToken: string, _refreshToken: string, profile: any, done: (error: Error | null, user?: any) => void) => {
      try {
        const email = resolveProfileEmail(profile)?.toLowerCase();
        if (!email) {
          done(new Error('Google profile does not include an email'));
          return;
        }

        const googleSub = profile.id;
        const displayName = profile.displayName || profile.name?.givenName || email;
        const avatarUrl = profile.photos?.[0]?.value ?? null;

        const existingUser = await prisma.user.findFirst({
          where: {
            OR: [{ googleSub }, { email }]
          }
        });

        if (existingUser) {
          const user = await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              email,
              googleSub,
              name: displayName,
              avatarUrl
            }
          });
          done(null, user);
          return;
        }

        const user = await prisma.user.create({
          data: {
            email,
            googleSub,
            name: displayName,
            avatarUrl
          }
        });

        done(null, user);
      } catch (error) {
        done(error as Error);
      }
    }
  )
);

export { passport };
