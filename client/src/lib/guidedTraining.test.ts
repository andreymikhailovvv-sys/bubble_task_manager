import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { AI_GUIDED_STEPS, FEATURE_GUIDED_STEPS, BASIC_OFFER_MARKER, TRAINING_SKINS, guidedSteps, nextGuidedStep, trainingOfferKey } from './guidedTraining';

test('all advanced steps are ordered, end explicitly and contain interactive examples', () => {
  for (const lesson of ['ai', 'features'] as const) {
    const steps = guidedSteps(lesson);
    assert.equal(new Set(steps.map(s => s.id)).size, steps.length);
    assert.equal(steps[0].center, true);
    assert.equal(steps.at(-1)?.done, true);
    assert.equal(nextGuidedStep(lesson, steps.at(-1)!.id), undefined);
    assert.ok(steps.filter(s => s.action).length >= 4);
    for (const step of steps.filter(s => s.action)) assert.ok(step.practice || step.allow, step.id);
  }
  assert.ok(AI_GUIDED_STEPS.some(s => s.practice === 'quick'));
  assert.ok(FEATURE_GUIDED_STEPS.some(s => s.practice === 'skins'));
});

test('training skins match actual catalog and include free and subscription tiers', () => {
  const catalog = readFileSync(new URL('../../../server/src/config/mascot-skins.ts', import.meta.url), 'utf8');
  for (const skin of TRAINING_SKINS) {
    const entry = catalog.split('\n').find(line => line.includes("id:'" + skin.id + "'") && line.includes("variant:'planner'"));
    assert.ok(entry?.includes("name:'" + skin.name + "'"), skin.id);
    assert.ok(entry?.includes('rank:' + skin.rank), skin.id);
  }
  assert.deepEqual([...new Set(TRAINING_SKINS.map(s => s.rank))], [0, 2, 3]);
});

test('first offer is separate from completion and account scoped', () => {
  assert.notEqual(trainingOfferKey('a'), trainingOfferKey('b'));
  const api = readFileSync(new URL('../../../server/src/routes/api.ts', import.meta.url), 'utf8');
  const claim = api.slice(api.indexOf("apiRouter.post('/training/basic/claim'"), api.indexOf("apiRouter.post('/training/lessons/:lessonId/complete'"));
  assert.ok(api.includes(BASIC_OFFER_MARKER));
  assert.match(claim, /pg_advisory_xact_lock/);
  assert.match(claim, /completedLessonIds\.includes\(BASIC_TRAINING_OFFER_MARKER\)/);
  assert.doesNotMatch(claim, /grantBonusCredits|buildEfficiencyUpdateData/);
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /api\.claimBasicTrainingOffer\(\)/);
  assert.match(app, /if \(show && !seenLocally\) autoBasicStartRef\.current\?\.\(\)/);
  assert.match(app, /rewardGuidedLesson\(BASIC_LESSON_ID\)/);
});
test('three standard lessons and one visible mascot during guided practice', () => {
  const menu = readFileSync(new URL('../components/UpdatesMenu.tsx', import.meta.url), 'utf8');
  assert.match(menu, /title: 'Обучение основам'/);
  assert.doesNotMatch(menu, /title: 'Рабочее пространство'|title: 'Работа с задачами'|Тестовое обучение от Планика/);
  const css = readFileSync(new URL('../components/BasicPlanikTraining.css', import.meta.url), 'utf8');
  assert.match(css, /body:has\(\[data-basic-training-overlay\]\) \.planik-mascot:not\(\[data-basic-training-overlay\] \.planik-mascot\)/);
  const practice = readFileSync(new URL('../components/TrainingPractice.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(practice, /api\.|fetch\(|localStorage|equipMascotSkin/);
  assert.match(practice, /changedSkin/);
  assert.match(practice, /onAnimation\(item.id\)/);
});
