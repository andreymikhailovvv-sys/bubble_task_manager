const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.DATABASE_URL) {
  console.error(
    '[startup] DATABASE_URL is required in production. Add a Render Postgres DATABASE_URL environment variable.'
  );
  process.exit(1);
}
