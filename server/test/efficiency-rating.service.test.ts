import assert from 'node:assert/strict';
import test from 'node:test';
import { deductEfficiencyPenalty } from '../src/services/efficiency-rating.service.js';

test('списывает весь штраф из первой непустой категории', () => {
  const scores = deductEfficiencyPenalty({ task: 100, habit: 0, ai: 0, focus: 0 }, 4);

  assert.deepEqual(scores, { task: 96, habit: 0, ai: 0, focus: 0 });
});

test('переходит к следующей категории с остатком штрафа', () => {
  const scores = deductEfficiencyPenalty({ task: 1.5, habit: 3, ai: 8, focus: 5 }, 4);

  assert.deepEqual(scores, { task: 0, habit: 0.5, ai: 8, focus: 5 });
});

test('последовательно пропускает пустые категории', () => {
  const scores = deductEfficiencyPenalty({ task: 0, habit: 0, ai: 2, focus: 5 }, 4);

  assert.deepEqual(scores, { task: 0, habit: 0, ai: 0, focus: 3 });
});
