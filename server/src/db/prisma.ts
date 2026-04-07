import { PrismaClient } from '@prisma/client';

const fallbackDatabaseUrl = 'file:./dev.db';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = fallbackDatabaseUrl;
  console.warn(
    `[db] DATABASE_URL is not set. Falling back to ${fallbackDatabaseUrl}. ` +
      'Set DATABASE_URL in environment for production persistence.'
  );
}

export const prisma = new PrismaClient();
