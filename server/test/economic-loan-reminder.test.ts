import test from 'node:test';
import assert from 'node:assert/strict';
import { economicLoanDueToday } from '../src/lib/economic-loan-reminder.js';

test('payment due on selected day after 09:00 in account timezone', () => {
  const selected = new Date('2026-11-16T12:00:00Z');
  assert.equal(economicLoanDueToday(selected, new Date('2026-11-16T06:01:00Z'), 'Europe/Moscow'), '2026-11');
  assert.equal(economicLoanDueToday(selected, new Date('2026-11-16T05:59:00Z'), 'Europe/Moscow'), null);
  assert.equal(economicLoanDueToday(selected, new Date('2026-11-17T12:00:00Z'), 'Europe/Moscow'), null);
});
test('recurring day 31 is clamped to last day of February', () => {
  const selected = new Date('2026-01-31T12:00:00Z');
  assert.equal(economicLoanDueToday(selected, new Date('2026-02-28T10:00:00Z'), 'UTC'), '2026-02');
  assert.equal(economicLoanDueToday(selected, new Date('2026-02-27T10:00:00Z'), 'UTC'), null);
});
test('payments never dispatch before initial month; invalid timezone is rejected', () => {
  const selected = new Date('2027-03-12T12:00:00Z');
  assert.equal(economicLoanDueToday(selected, new Date('2027-02-12T12:00:00Z'), 'UTC'), null);
  assert.equal(economicLoanDueToday(selected, new Date('2027-03-12T12:00:00Z'), 'Invalid/Zone'), null);
});
test('the selected calendar day is evaluated in the owners local time', () => {
  const selected = new Date('2026-11-16T12:00:00Z');
  assert.equal(economicLoanDueToday(selected, new Date('2026-11-16T08:30:00Z'), 'Europe/Riga'), '2026-11');
  assert.equal(economicLoanDueToday(selected, new Date('2026-11-16T08:30:00Z'), 'America/New_York'), null);
});
