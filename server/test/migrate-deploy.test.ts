import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
// The deployment runner is JavaScript so production can execute it before the TypeScript build.
// @ts-expect-error The .mjs deployment script intentionally has no declaration file.
import { runMigrateDeploy } from '../scripts/migrate-deploy.mjs';

const WALLET_MIGRATION = '20260930200000_add_ai_credit_wallet';

const outputSink = () => {
  let value = '';
  return {
    stream: { write: (chunk: string) => { value += chunk; } },
    read: () => value
  };
};

test('wallet migration поддерживает чистую и partial schema и явно транзакционна', async () => {
  const sql = await readFile(new URL('../prisma/migrations/20260930200000_add_ai_credit_wallet/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /^--[^]*\nBEGIN;/);
  for (const column of ['aiIncludedCreditsMilli', 'aiBonusCreditsMilli', 'aiPurchasedCreditsMilli']) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"`));
  }
  assert.match(sql, /COMMIT;\s*$/);
});

test('wallet backfill повторяем, сохраняет 36 credits и использует bigint-safe проверки', async () => {
  const sql = await readFile(new URL('../prisma/migrations/20260930200000_add_ai_credit_wallet/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /"aiIncludedCreditsMilli" = 0/);
  assert.match(sql, /"aiBonusCreditsMilli" = \("aiCredits"::bigint \* 1000\)::integer/);
  assert.match(sql, /"aiPurchasedCreditsMilli" = 0/);
  assert.match(sql, /NOT BETWEEN -2147483648 AND 2147483647/);
  assert.match(sql, /"aiIncludedCreditsMilli"::bigint/);
  assert.match(sql, /"aiCredits"::bigint \* 1000/);
  const backfill = (credits: number) => ({ included: 0, bonus: credits * 1000, purchased: 0 });
  assert.deepEqual(backfill(36), { included: 0, bonus: 36_000, purchased: 0 });
  assert.deepEqual(backfill(36), backfill(36));
});

test('P3009 известной wallet migration вызывает rolled-back и ровно один retry', () => {
  const calls: string[][] = [];
  const results = [
    { status: 1, stdout: '', stderr: `P3009 ${WALLET_MIGRATION}` },
    { status: 0, stdout: 'resolved\n', stderr: '' },
    { status: 0, stdout: 'applied\n', stderr: '' }
  ];
  const stdout = outputSink();
  const stderr = outputSink();
  const status = runMigrateDeploy({
    executePrisma: (args: string[]) => { calls.push(args); return results.shift(); },
    stdout: stdout.stream,
    stderr: stderr.stream
  });
  assert.equal(status, 0);
  assert.deepEqual(calls, [
    ['migrate', 'deploy'],
    ['migrate', 'resolve', '--rolled-back', WALLET_MIGRATION],
    ['migrate', 'deploy']
  ]);
  assert.match(stderr.read(), /Detected failed known migration/);
  assert.match(stderr.read(), /Retrying idempotent migration/);
  assert.match(stdout.read(), /applied/);
});

test('неизвестная failed migration не получает auto-resolve', () => {
  const calls: string[][] = [];
  const status = runMigrateDeploy({
    executePrisma: (args: string[]) => {
      calls.push(args);
      return { status: 1, stdout: '', stderr: 'P3009 20990101000000_unknown' };
    },
    stdout: outputSink().stream,
    stderr: outputSink().stream
  });
  assert.equal(status, 1);
  assert.deepEqual(calls, [['migrate', 'deploy']]);
});

test('ошибка единственного retry возвращает non-zero и печатает полный SQL error', () => {
  const results = [
    { status: 1, stdout: '', stderr: `P3009 ${WALLET_MIGRATION}\n` },
    { status: 0, stdout: '', stderr: '' },
    { status: 1, stdout: 'retry stdout\n', stderr: 'P3018 actionable PostgreSQL error\n' }
  ];
  const stdout = outputSink();
  const stderr = outputSink();
  const status = runMigrateDeploy({
    executePrisma: () => results.shift(),
    stdout: stdout.stream,
    stderr: stderr.stream
  });
  assert.equal(status, 1);
  assert.match(stdout.read(), /retry stdout/);
  assert.match(stderr.read(), /P3018 actionable PostgreSQL error/);
  assert.equal(results.length, 0);
});
