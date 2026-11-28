import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEconomicPositions } from '../src/lib/economic-operation-details.js';
test('normalizes receipt positions without floating-point conversion', () => {
  assert.equal(normalizeEconomicPositions([{name:' Хлеб ',amountMinor:'00100'},{name:'Скидка',amountMinor:'-20'}]), '[{"name":"Хлеб","amountMinor":"100"},{"name":"Скидка","amountMinor":"-20"}]');
  assert.equal(normalizeEconomicPositions(null), '[]');
  assert.throws(() => normalizeEconomicPositions([{name:'x',amountMinor:1}]));
  assert.throws(() => normalizeEconomicPositions([{name:'',amountMinor:'1'}]));
});
