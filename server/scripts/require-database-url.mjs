const isProduction = process.env.NODE_ENV === 'production';
const url = process.env.DATABASE_URL;

if (isProduction && !url) {
  console.error('[startup] DATABASE_URL is missing');
  process.exit(1);
}
