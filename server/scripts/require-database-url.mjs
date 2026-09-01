const isProduction = process.env.NODE_ENV === 'production';
const url = process.env.DATABASE_URL;

if (isProduction && !url) {
  console.error('[startup] DATABASE_URL is missing');
  process.exit(1);
}

if (url) {
  console.log('[startup] DATABASE_URL debug:', {
    length: url.length,
    first20: JSON.stringify(url.slice(0, 20)),
    firstChars: [...url.slice(0, 5)].map((c) => c.charCodeAt(0)),
    startsPostgres: url.startsWith('postgresql://'),
    startsPostgresShort: url.startsWith('postgres://'),
  });
}
