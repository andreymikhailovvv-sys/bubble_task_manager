import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatServerLogTimestamp } from '../src/lib/timestamp-console.js';

test('app log prefixes include readable Moscow date, time and milliseconds', () => {
  if (process.env.LOG_TIME_ZONE) {
    assert.match(formatServerLogTimestamp(new Date()), /^\[\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}\.\d{3} [^\]]+\]$/);
    return;
  }
  assert.equal(formatServerLogTimestamp(new Date('2026-11-11T14:26:35.042Z')),
    '[11.11.2026 17:26:35.042 МСК]');
});

test('the logger initializes ahead of routes and installs common console methods', async () => {
  const [entry, module] = await Promise.all([
    readFile(new URL('../src/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/timestamp-console.ts', import.meta.url), 'utf8')
  ]);
  assert.match(entry, /^import 'dotenv\/config';\s*import '\.\/lib\/timestamp-console\.js';/);
  assert.match(module, /'log', 'info', 'warn', 'error', 'debug', 'trace'/);
  assert.match(module, /original\(formatServerLogTimestamp\(\), \.\.\.args\)/);
});
