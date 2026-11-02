import assert from 'node:assert/strict';
import test from 'node:test';
import { startAiIntroOverlay, type IntroEvent } from '../src/services/ai-quick-intro.service.js';

const sleep = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

test('fast intro animates in small chunks and is replaced by the first main-model delta', async () => {
  const events: IntroEvent[] = [];
  let signal: AbortSignal | undefined;
  const overlay = startAiIntroOverlay({
    question: 'Что у меня завтра утром?',
    context: 'Помощь ИИ',
    tickMs: 1,
    send: event => events.push(event),
    requestIntro: async input => {
      signal = input.signal;
      input.onText('Сейчас проверю перечень задач.');
    }
  });
  await sleep(23);
  assert.ok(events.length > 1);
  assert.ok(events.some(event => event.type === 'delta'));
  assert.ok(events.every(event => event.type !== 'delta' || Array.from(event.text).length <= 3));
  overlay.onMainDelta('На завтра запланированы...');
  assert.equal(signal?.aborted, true);
  const resetIndex = events.findIndex(event => event.type === 'reset');
  assert.ok(resetIndex > 0);
  assert.deepEqual(events.at(-1), { type: 'delta', text: 'На завтра запланированы...' });
  const size = events.length;
  await sleep(12);
  assert.equal(events.length, size);
});

test('main answer arriving first cancels intro before anything is shown', async () => {
  const events: IntroEvent[] = [];
  let lateIntro: ((delta: string) => void) | undefined;
  const overlay = startAiIntroOverlay({
    question: 'Какие задачи?',
    context: 'Личный чат',
    tickMs: 1,
    send: event => events.push(event),
    requestIntro: async ({ onText }) => { lateIntro = onText; }
  });
  overlay.onMainDelta('Фактический ответ');
  lateIntro?.('Опоздавшая фраза');
  await sleep(10);
  assert.deepEqual(events, [{type:'delta',text:'Фактический ответ'}]);
  overlay.stop();
});

test('main text reset interrupts intro and preserves existing reset contract', async () => {
  const events: IntroEvent[] = [];
  const overlay = startAiIntroOverlay({
    question:'Анализ',
    context:'Задачи',
    tickMs:1,
    send:event=>events.push(event),
    requestIntro:async ({onText})=>{onText('Я проверю задачи');}
  });
  await sleep(10);
  overlay.onMainReset();
  assert.equal(events.at(-1)?.type,'reset');
  overlay.onMainDelta('Итог');
  assert.deepEqual(events.at(-1),{type:'delta',text:'Итог'});
  overlay.stop();
});
