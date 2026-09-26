import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlannerToolsService, rankPlannerSearchCandidates, validatePlannerActionResolution, type PlannerActionInput, type PlannerCandidate } from '../src/services/planner-tools.service.js';

const candidate = (id: string, title: string, extra: Partial<PlannerCandidate> = {}): PlannerCandidate => ({ id, title, description: null, status: 'TODO', dueDate: null, taskType: 'TASK', parentTaskId: null, updatedAt: new Date('2026-01-01'), sphere: null, parentTask: null, ...extra });
const action = (override: Partial<PlannerActionInput>): PlannerActionInput => ({ operation: 'reschedule', itemId: 'item-1', parentTaskId: null, title: null, description: null, dueDate: '2026-10-02T18:00:00+03:00', importance: null, urgency: null, notifyBeforeMinutes: null, sphereId: null, location: null, ...override });

test('комбинация трёх контекстных тегов уверенно побеждает общее слово', () => {
  const ranked = rankPlannerSearchCandidates([
    candidate('one', 'Подготовить презентацию к защите проекта'), candidate('two', 'Презентация квартального отчёта'), candidate('three', 'Презентация музейной выставки')
  ], { queries: ['презентация защиты проекта'], keywords: ['презентация', 'защита', 'проект'], sphereHints: [] });
  assert.equal(ranked[0]?.candidate.id, 'one');
  assert.ok(ranked[0]!.score - ranked[1]!.score >= 30);
});

test('находит подзадачу по её названию и названию родителя', () => {
  const ranked = rankPlannerSearchCandidates([
    candidate('sub', 'Согласовать слайды с руководителем', { parentTaskId: 'parent', parentTask: { id: 'parent', title: 'Подготовка защиты проекта' } })
  ], { queries: ['слайды для защиты'], keywords: ['слайды', 'защита', 'руководитель'], sphereHints: [] });
  assert.equal(ranked[0]?.candidate.id, 'sub'); assert.deepEqual(ranked[0]?.matchedTerms, ['слайды', 'защита', 'руководитель']);
});

test('опечатка не уничтожает результат trigram ranking', () => {
  const ranked = rankPlannerSearchCandidates([candidate('one', 'Подготовить презентацию')], { queries: ['подгатовить презинтацию'], keywords: [], sphereHints: [] });
  assert.equal(ranked[0]?.candidate.id, 'one'); assert.ok(ranked[0]!.score > 8);
});

test('выдуманный itemId и непросмотренный sphereId отклоняются', () => {
  assert.equal(validatePlannerActionResolution(action({ itemId: 'fake' }), new Set(), new Set())?.code, 'ITEM_NOT_RESOLVED');
  assert.equal(validatePlannerActionResolution(action({ operation: 'change_sphere', sphereId: 'fake' }), new Set(['item-1']), new Set())?.code, 'SPHERE_NOT_RESOLVED');
});

test('неизвестная операция и invalid dueDate отклоняются', () => {
  assert.equal(validatePlannerActionResolution(action({ operation: 'unknown' as never }), new Set(['item-1']), new Set())?.code, 'INVALID_OPERATION');
  assert.equal(validatePlannerActionResolution(action({ dueDate: 'завтра' }), new Set(['item-1']), new Set())?.code, 'INVALID_DUE_DATE');
});

test('задача другого пользователя и root-only операция подзадачи отклоняются', async () => {
  const foreign = createPlannerToolsService({ task: { findFirst: async () => null } });
  const notFound = await foreign.action('user-1', action({}), new Set(['item-1']), new Set(), 'Europe/Moscow');
  assert.equal(notFound.code, 'ITEM_NOT_FOUND');
  const subtask = createPlannerToolsService({ task: { findFirst: async () => ({ id: 'item-1', title: 'Подзадача', dueDate: null, status: 'TODO', parentTaskId: 'parent', importance: 3, urgency: 3 }) } });
  const denied = await subtask.action('user-1', action({ operation: 'set_priority', dueDate: null, importance: 5 }), new Set(['item-1']), new Set(), 'Europe/Moscow');
  assert.equal(denied.code, 'SUBTASK_OPERATION_NOT_ALLOWED');
});
