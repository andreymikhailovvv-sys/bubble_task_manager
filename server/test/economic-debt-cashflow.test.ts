import test from 'node:test';
import assert from 'node:assert/strict';
import { debtOperationKind, debtOperationTitle, economicSourceDelta, economicOperationTotals, ECONOMIC_DEBT_OPERATION_KINDS } from '../src/lib/economic-debt.js';

test('new borrowed debt credits main account and repayment debits it', () => {
  assert.equal(debtOperationKind('OWE', 'FUNDING'), 'DEBT_BORROWED');
  assert.equal(economicSourceDelta(debtOperationKind('OWE', 'FUNDING'), 130050n), 130050n);
  assert.equal(economicSourceDelta(debtOperationKind('OWE', 'SETTLEMENT'), 130050n), -130050n);
});
test('new loan to another person debits main account, return credits it', () => {
  assert.equal(debtOperationKind('OWED_TO_ME', 'FUNDING'), 'DEBT_LENT');
  assert.equal(economicSourceDelta(debtOperationKind('OWED_TO_ME', 'FUNDING'), 9999n), -9999n);
  assert.equal(economicSourceDelta(debtOperationKind('OWED_TO_ME', 'SETTLEMENT'), 9999n), 9999n);
});
test('debt edits may swap direction and update derived ledger classification', () => {
  assert.equal(economicSourceDelta(debtOperationKind('OWE', 'FUNDING'), 500000n), 500000n);
  assert.equal(economicSourceDelta(debtOperationKind('OWED_TO_ME', 'FUNDING'), 200000n), -200000n);
  assert.equal(debtOperationTitle('OWED_TO_ME', 'FUNDING', 'Ден'), 'Выдано в долг: Ден');
});
test('debt classifications are distinct from income, expense and internal transfers', () => {
  assert.deepEqual(ECONOMIC_DEBT_OPERATION_KINDS, [
    'DEBT_BORROWED', 'DEBT_LENT', 'DEBT_REPAID', 'DEBT_RETURNED'
  ]);
  assert.equal(economicSourceDelta('INCOME', 55n), 55n);
  assert.equal(economicSourceDelta('EXPENSE', 55n), -55n);
  assert.equal(economicSourceDelta('TRANSFER', 55n), -55n);
});

test('filtered ledger totals count debt cash movements and corrections but not internal transfers',()=>{
  const group=(kind:string,amountMinor:bigint)=>({kind,_sum:{amountMinor}});
  assert.deepEqual(economicOperationTotals([group('INCOME',100000n),group('EXPENSE',12500n),group('DEBT_BORROWED',50000n),group('DEBT_REPAID',20000n),group('TRANSFER',999999n)]),{receivedMinor:'150000',spentMinor:'32500',netMinor:'117500'});
  assert.deepEqual(economicOperationTotals([]),{receivedMinor:'0',spentMinor:'0',netMinor:'0'});
});
