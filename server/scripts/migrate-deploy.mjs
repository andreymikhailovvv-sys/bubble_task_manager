import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RECOVERABLE_MIGRATION = '20260926120000_add_telegram_registration_state';
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

const printCapturedOutput = (result) => {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
};

const initialDeploy = runPrisma(['migrate', 'deploy'], { capture: true });
printCapturedOutput(initialDeploy);

if (initialDeploy.status === 0) process.exit(0);

const deployOutput = `${initialDeploy.stdout ?? ''}\n${initialDeploy.stderr ?? ''}`;
const isKnownFailedMigration = deployOutput.includes('P3009') && deployOutput.includes(RECOVERABLE_MIGRATION);

if (!isKnownFailedMigration) process.exit(initialDeploy.status ?? 1);

console.warn(`Обнаружена незавершённая миграция ${RECOVERABLE_MIGRATION}. Помечаем неудачную попытку откатанной и повторяем безопасную миграцию.`);
const resolveResult = runPrisma(['migrate', 'resolve', '--rolled-back', RECOVERABLE_MIGRATION]);
if (resolveResult.status !== 0) process.exit(resolveResult.status ?? 1);

const retryDeploy = runPrisma(['migrate', 'deploy']);
process.exit(retryDeploy.status ?? 1);
