import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContextualAiIntro } from '../src/services/ai-quick-intro-context.service.js';
import { startAiIntroOverlay, type IntroEvent } from '../src/services/ai-quick-intro.service.js';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const collected = (events: IntroEvent[]) =>
  events.filter((event): event is { type: 'delta'; text: string } => event.type === 'delta')
    .map(event => event.text).join('');

test('fallback is specific to mailbox, overdue tasks, writing and planning requests', () => {
  const email = buildContextualAiIntro('Покажи новые письма Яндекс Почты', 'Быстрые запросы');
  const tasks = buildContextualAiIntro('Какие задачи у меня просрочены?', 'Помощь ИИ');
  const text = buildContextualAiIntro('Напиши текст и раздели его на абзацы', 'Быстрые запросы');
  const plan = buildContextualAiIntro('Сделай стратегию запуска сервиса', 'Быстрые запросы');
  assert.match(email, /письм/iu);
  assert.match(tasks, /срок/iu);
  assert.match(text, /структур|абзац/iu);
  assert.match(plan, /шаг|приоритет/iu);
  assert.equal(new Set([email, tasks, text, plan]).size, 4);
  assert.ok(![email,tasks,text,plan].some(line => line === 'Сейчас разберу запрос и подготовлю ответ.'));
});

test('local context appears before the delayed model even begins responding', async () => {
  const events: IntroEvent[] = [];
  let emitModel: ((text: string) => void) | undefined;
  let resolveModel: (() => void) | undefined;
  const overlay = startAiIntroOverlay({
    question: 'Посмотри просроченные задачи',
    context: 'Быстрые запросы',
    previewDelayMs: 1,
    tickMs: 1,
    modelDeadlineMs: 500,
    send: event => events.push(event),
    requestIntro: ({ onText }) => {
      emitModel = onText;
      return new Promise<void>(resolve => { resolveModel = resolve; });
    }
  });
  try {
    await sleep(65);
    assert.match(collected(events), /срок/iu);
    assert.equal(events.some(item => item.type === 'reset'), false);
    emitModel?.('Сверю просроченные задачи и подготовлю список по важности.');
    resolveModel?.();
    await sleep(70);
    const lastReset = events.findLastIndex(item => item.type === 'reset');
    assert.ok(lastReset > 0);
    assert.match(collected(events.slice(lastReset + 1)), /просроченные задачи/iu);
    overlay.onMainDelta('Просроченных задач две.');
    assert.deepEqual(events.at(-1), { type: 'delta', text: 'Просроченных задач две.' });
  } finally { overlay.stop(); }
});

test('slow cheap model times out without delaying context-specific preview or main response', async () => {
  const events: IntroEvent[] = [];
  let signal: AbortSignal | undefined;
  const overlay = startAiIntroOverlay({
    question: 'Составь короткую сводку',
    context: 'Личный чат',
    tickMs: 1, previewDelayMs: 1, modelDeadlineMs: 25,
    send: e => events.push(e),
    requestIntro: ({ signal: requestSignal }) => {
      signal = requestSignal;
      return new Promise<void>(() => {});
    }
  });
  try {
    await sleep(70);
    assert.equal(signal?.aborted, true);
    assert.match(collected(events), /сводк/iu);
    overlay.onMainDelta('Вот сводка.');
    assert.deepEqual(events.at(-1), { type: 'delta', text: 'Вот сводка.' });
  } finally { overlay.stop(); }
});

test('an instantaneous main answer prevents either fallback or cheap-model output', async () => {
  const events: IntroEvent[] = [];
  const overlay = startAiIntroOverlay({
    question: 'Найди письма', context: 'Почта',
    tickMs: 1, previewDelayMs: 1,
    send: event => events.push(event),
    requestIntro: async ({onText}) => {
      await sleep(15);
      onText('Проверю почту');
    }
  });
  overlay.onMainDelta('Ответ без предварительного текста');
  await sleep(24);
  assert.deepEqual(events, [{ type: 'delta', text: 'Ответ без предварительного текста' }]);
  overlay.stop();
});
