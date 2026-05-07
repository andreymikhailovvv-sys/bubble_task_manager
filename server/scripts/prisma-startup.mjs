import { spawnSync } from 'node:child_process';

function run(command, args) {
  return spawnSync(command, args, { stdio: 'inherit', env: process.env });
}

const migrate = run('npx', ['prisma', 'migrate', 'deploy']);
if (migrate.status === 0) {
  process.exit(0);
}

console.warn('[startup] prisma migrate deploy failed, trying prisma db push as fallback');
const dbPush = run('npx', ['prisma', 'db', 'push', '--accept-data-loss']);
if (dbPush.status === 0) {
  console.warn('[startup] prisma db push succeeded');
  process.exit(0);
}

console.error('[startup] both prisma migrate deploy and prisma db push failed');
process.exit(dbPush.status ?? 1);
