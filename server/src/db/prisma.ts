import { PrismaClient } from '@prisma/client';
import { performanceDiagnosticsEnabled, recordDatabaseQuery } from '../lib/performance-diagnostics.js';

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

// Capture only aggregate query durations; never print SQL or bind parameters.
const diagnosticLogOptions = performanceDiagnosticsEnabled
  ? [{ emit: 'event' as const, level: 'query' as const }]
  : [];
export const prisma = new PrismaClient({ log: diagnosticLogOptions });
if (performanceDiagnosticsEnabled) {
  prisma.$on('query', event => {
    recordDatabaseQuery(event.query, event.duration);
  });
}
