import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveThemeMode } from './autoTheme';

test('auto theme changes at 20:00 and 05:00 in selected user time zone', () => {
  const z = 'Europe/Moscow'; // UTC+3
  assert.equal(resolveThemeMode('auto', z, new Date('2026-10-09T16:59:00Z')), 'light');
  assert.equal(resolveThemeMode('auto', z, new Date('2026-10-09T17:00:00Z')), 'dark');
  assert.equal(resolveThemeMode('auto', z, new Date('2026-10-10T01:59:00Z')), 'dark');
  assert.equal(resolveThemeMode('auto', z, new Date('2026-10-10T02:00:00Z')), 'light');
});

test('auto theme uses user zone rather than device zone and handles DST', () => {
  const moment = new Date('2026-07-10T18:30:00Z');
  assert.equal(resolveThemeMode('auto', 'Europe/London', moment), 'light'); // 19:30 BST
  assert.equal(resolveThemeMode('auto', 'Europe/Moscow', moment), 'dark'); // 21:30 MSK
});

test('manual selection remains manual and invalid zones are safe', () => {
  const time = new Date('2026-10-09T22:00:00Z');
  assert.equal(resolveThemeMode('light', 'Europe/Moscow', time), 'light');
  assert.equal(resolveThemeMode('dark', 'Europe/Moscow', time), 'dark');
  assert.equal(resolveThemeMode('auto', 'Not/A_Real_Zone', time), 'light');
});
