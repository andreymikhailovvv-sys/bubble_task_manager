import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RECOVERABLE_MIGRATIONS = [
  '20260926120000_add_telegram_registration_state',
  '20260930200000_add_ai_credit_wallet'
];
const serverDirectory = fileURLToPath(new URL('..', import.meta.url));
const prismaExecutable = fileURLToPath(new URL('../../node_modules/prisma/build/index.js', import.meta.url));

const runPrisma = (args, options = {}) => spawnSync(
  process.execPath,
  [prismaExecutable, ...args],
  {
    cwd: serverDirectory,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit'
  }
);

export const runMigrateDeploy = ({ executePrisma = runPrisma, stdout = process.stdout, stderr = process.stderr } = {}) => {
  const printOutput = (result) => {
    if (result.stdout) stdout.write(result.stdout);
    if (result.stderr) stderr.write(result.stderr);
  };

  const initialDeploy = executePrisma(['migrate', 'deploy'], { capture: true });
  printOutput(initialDeploy);

  if (initialDeploy.status === 0) return 0;

  const deployOutput = `${initialDeploy.stdout ?? ''}\n${initialDeploy.stderr ?? ''}`;
  const failedMigration = deployOutput.includes('P3009')
    ? RECOVERABLE_MIGRATIONS.find((migration) => deployOutput.includes(migration))
    : undefined;

  if (!failedMigration) return initialDeploy.status ?? 1;

  stderr.write(`[Prisma recovery] Detected failed known migration: ${failedMigration}\n`);
  stderr.write('[Prisma recovery] Marking failed attempt as rolled back\n');
  const resolveResult = executePrisma(['migrate', 'resolve', '--rolled-back', failedMigration], { capture: true });
  printOutput(resolveResult);
  if (resolveResult.status !== 0) return resolveResult.status ?? 1;

  stderr.write('[Prisma recovery] Retrying idempotent migration\n');
  const retryDeploy = executePrisma(['migrate', 'deploy'], { capture: true });
  printOutput(retryDeploy);
  return retryDeploy.status ?? 1;
};

const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) process.exit(runMigrateDeploy());
