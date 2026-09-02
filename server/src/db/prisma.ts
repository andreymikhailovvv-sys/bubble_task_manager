import { PrismaClient } from '@prisma/client';

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required in production. Set DATABASE_URL before starting the server.'
  );
}

if (!isProduction && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
  console.warn('[db] DATABASE_URL is not set. Using local SQLite database file:./dev.db for development.');
}

export const prisma = new PrismaClient();
