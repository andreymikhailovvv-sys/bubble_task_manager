import test from 'node:test';
import assert from 'node:assert/strict';
import { annuityEstimate, formatMinorRub, minorToRublesInput, rublesToMinor, groupMoneyInput, calculateMoneyInput } from './economicMoney';

test('Economic parses rubles as integer kopecks without float rounding', () => {
  assert.equal(rublesToMinor('0,01'), '1');
  assert.equal(rublesToMinor('1 234,56'), '123456');
  assert.equal(rublesToMinor('10.2'), '1020');
  assert.equal(rublesToMinor('-5,13', true), '-513');
  assert.throws(() => rublesToMinor('-5,13'));
  assert.throws(() => rublesToMinor('1,999'));
  assert.equal(minorToRublesInput('123456'), '1 234,56');
  assert.match(formatMinorRub('123456'), /1.234,56 ₽/);
});
test('Zero-rate annuity has no extra interest and handles final rounding', () => {
  assert.deepEqual(annuityEstimate({ principalMinor:'120000', annualRateBps:0, termMonths:12 }), {
    monthly:'10000', total:'120000', overpay:'0'
  });
  const odd = annuityEstimate({ principalMinor:'100', annualRateBps:0, termMonths:3 });
  assert.equal(odd.total, '100');
  assert.equal(odd.overpay, '0');
});
test('Annual interest rate uses basis points, with a nonzero overpayment', () => {
  const result = annuityEstimate({ principalMinor:'120000000', annualRateBps:1200, termMonths:12 });
  assert.ok(BigInt(result.monthly) > 10000000n);
  assert.ok(BigInt(result.overpay) > 0n);
  assert.equal(BigInt(result.total) - 120000000n, BigInt(result.overpay));
});
test('Annuity rejects invalid loan parameters', () => {
  assert.throws(() => annuityEstimate({ principalMinor:'0', annualRateBps:1200, termMonths:12 }));
  assert.throws(() => annuityEstimate({ principalMinor:'100', annualRateBps:-1, termMonths:12 }));
  assert.throws(() => annuityEstimate({ principalMinor:'100', annualRateBps:1200, termMonths:0 }));
});

test('amount grouping and exact calculator', () => {
  assert.equal(groupMoneyInput('100000,25+2000'), '100 000,25+2 000');
  assert.equal(groupMoneyInput('-1000,'), '-1 000,');
  assert.equal(calculateMoneyInput('1 000 + 2 x 50'), '110000');
  assert.equal(calculateMoneyInput('100 : 3'), '3333');
  assert.equal(calculateMoneyInput('0,1 + 0,2'), '30');
  assert.throws(() => calculateMoneyInput('100/0'));
  assert.throws(() => calculateMoneyInput('100+'));
  assert.throws(() => calculateMoneyInput('1-2'));
});
