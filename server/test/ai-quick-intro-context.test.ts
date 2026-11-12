import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContextualAiIntro } from '../src/services/ai-quick-intro-context.service.js';
import { startAiIntroOverlay, type IntroEvent } from '../src/services/ai-quick-intro.service.js';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const collected = (events: IntroEvent[]) =>
  events.filter((event): event is { type: 'delta'; text: string } => event.type === 'delta')
    .map(event => event.text).join('');

test('server fallback is specific to mailbox, overdue tasks, writing and planning requests', () => {
  const email = buildContextualAiIntro('Покажи новые письма Яндекс Почты', 'Быстрые запросы');
  const tasks = buildContextualAiIntro('Какие задачи у меня просрочены?', 'Помощь ИИ');
  const text = buildContextualAiIntro('Напиши текст и раздели его на абзацы', 'Быстрые запросы');
  const plan = buildContextualAiIntro('Сделай стратегию запуска сервиса', 'Быстрые запросы');
  assert.match(email, /письм/iu);
  assert.match(tasks, /срок/iu);
  assert.match(buildContextualAiIntro('Проверь просроченные задачи из сектора Личное', 'Чат'), /Личное/u);
  assert.match(email, /Яндекс Почты/u);
  assert.match(text, /структур|абзац/iu);
  assert.match(plan, /шаг|приоритет/iu);
  assert.equal(new Set([email, tasks, text, plan]).size, 4);
});

test('successful fast model is the only source of intro; no server preview or intermediate reset', async () => {
  const events: IntroEvent[] = [];
  let emitModel: ((text: string) => void) | undefined;
  let resolveModel: (() => void) | undefined;
  const overlay = startAiIntroOverlay({
    question: 'Посмотри просроченные задачи',
    context: 'Быстрые запросы',
    tickMs: 1,
    modelDeadlineMs: 500,
    send: event => events.push(event),
    requestIntro: ({ onText }) => {
      emitModel = onText;
      return new Promise<void>(resolve => { resolveModel = resolve; });
    }
  });
  try {
    await sleep(40);
    assert.deepEqual(events, [], 'server should remain silent while model succeeds');
    emitModel?.('Сверю просроченные задачи и подготовлю список по важности.');
    resolveModel?.();
    await sleep(95);
    assert.equal(events.some(item => item.type === 'reset'), false);
    assert.equal(collected(events), 'Сверю просроченные задачи и подготовлю список по важности.');
    overlay.onMainDelta('Просроченных задач две.');
    assert.equal(events.filter(item => item.type === 'reset').length, 1);
    assert.deepEqual(events.at(-1), { type: 'delta', text: 'Просроченных задач две.' });
  } finally { overlay.stop(); }
});

test('only provider errors trigger the fixed neutral server fallback', async () => {
  const events: IntroEvent[] = [];
  const overlay = startAiIntroOverlay({
    question: 'Новые письма Яндекс Почты', context: 'Почта',
    tickMs: 1, modelDeadlineMs: 500,
    send: event => events.push(event),
    requestIntro: async () => { throw new Error('provider unavailable'); }
  });
  try {
    await sleep(100);
    assert.equal(collected(events), 'Работаю над вашим запросом..');
    assert.equal(events.some(item => item.type === 'reset'), false);
    overlay.onMainDelta('Писем нет.');
    assert.equal(events.filter(item => item.type === 'reset').length, 1);
  } finally { overlay.stop(); }
});

test('empty model response also triggers the fixed server fallback', async () => {
  const events: IntroEvent[] = [];
  const overlay = startAiIntroOverlay({
    question: 'Составь краткую сводку', context: 'Личный чат',
    tickMs: 1, modelDeadlineMs: 500,
    send: event => events.push(event),
    requestIntro: async () => {}
  });
  try {
    await sleep(100);
    assert.equal(collected(events), 'Работаю над вашим запросом..');
    assert.equal(events.some(item => item.type === 'reset'), false);
  } finally { overlay.stop(); }
});

test('model timeout yields fallback without late model text or a preview reset', async () => {
  const events: IntroEvent[] = [];
  let signal: AbortSignal | undefined;
  let emitLateModel: ((text: string) => void) | undefined;
  let resolveLateModel: (() => void) | undefined;
  const overlay = startAiIntroOverlay({
    question: 'Составь короткую сводку',
    context: 'Личный чат',
    tickMs: 1, modelDeadlineMs: 25,
    send: event => events.push(event),
    requestIntro: ({ signal: requestSignal, onText }) => {
      signal = requestSignal;
      emitLateModel = onText;
      return new Promise<void>(resolve => { resolveLateModel = resolve; });
    }
  });
  try {
    await sleep(90);
    assert.equal(signal?.aborted, true);
    assert.equal(collected(events), 'Работаю над вашим запросом..');
    emitLateModel?.('Опоздавший ответ вспомогательной модели.');
    resolveLateModel?.();
    await sleep(15);
    assert.equal(events.some(item => item.type === 'reset'), false);
    assert.doesNotMatch(collected(events), /Опоздавший/iu);
    overlay.onMainDelta('Вот сводка.');
    assert.deepEqual(events.at(-1), { type: 'delta', text: 'Вот сводка.' });
  } finally { overlay.stop(); }
});

test('main answer arriving first prevents either model or server fallback from showing', async () => {
  const events: IntroEvent[] = [];
  const overlay = startAiIntroOverlay({
    question: 'Найди письма', context: 'Почта',
    tickMs: 1, modelDeadlineMs: 20,
    send: event => events.push(event),
    requestIntro: async ({ onText }) => {
      await sleep(35);
      onText('Проверю почту и соберу нужные письма.');
    }
  });
  overlay.onMainDelta('Ответ без предварительного текста');
  await sleep(60);
  assert.deepEqual(events, [{ type: 'delta', text: 'Ответ без предварительного текста' }]);
  overlay.stop();
});

test('slow introductory model receives the entire configured window before fallback', async () => {
  const events: IntroEvent[] = [];
  let finishIntro: (() => void) | undefined;
  const overlay = startAiIntroOverlay({
    question: 'Разные задачи', context: 'Задачи',
    tickMs: 1, modelDeadlineMs: 90,
    send: event => events.push(event),
    requestIntro: () => new Promise<void>(resolve => { finishIntro = resolve; })
  });
  try {
    await sleep(25);
    assert.equal(collected(events), '', 'no fallback before the deadline');
    await sleep(150);
    assert.equal(collected(events), 'Работаю над вашим запросом..');
    finishIntro?.();
  } finally { overlay.stop(); }
});
