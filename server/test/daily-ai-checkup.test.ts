import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildDailyCheckupPayload, formatSmartDailyCheckup, parseDailyCheckupResponse } from '../src/services/daily-ai-checkup.service.js';

test('morning AI checkup uses private structured JSON, not a server-side template', () => {
  const payload = buildDailyCheckupPayload({ tasks: [{ id: 't1', title: 'Сделать проект' }] }, 'gpt-6-luna');
  assert.equal(payload.store, false);
  assert.deepEqual(payload.reasoning, { effort: 'low' });
  assert.equal(payload.text.format.strict, true);
  assert.equal(payload.tool_choice, 'none');
  const response = parseDailyCheckupResponse({ status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: '{"greeting":"Доброе утро!","priorities":[],"workload":"Нагрузка умеренная","risks":[],"insight":"","nextStep":"","moves":[]}' }] }] });
  assert.equal(response.workload, 'Нагрузка умеренная');
  assert.throws(() => parseDailyCheckupResponse({ status: 'incomplete', output_text: '{"greeting":"Обрыв"}' }));
});

test('AI can only recommend postponing accessible, nonurgent tasks within a week', () => {
  const now = new Date('2026-10-22T08:00:00Z');
  const tomorrow = new Date('2026-10-23T00:00:00Z');
  const tasks = [
    { id: 'today', title: 'Срочно', dueDate: '2026-10-22T15:00:00Z' },
    { id: 'later', title: 'Не срочно', dueDate: '2026-10-24T12:00:00Z' }
  ];
  const response = { greeting: 'Утро', workload: 'Три дела', risks: ['Недостаточно времени'],
    insight: '', nextStep: 'Начните с важного',
    priorities: [{ taskId: 'later', reason: 'Зависит от других' }, { taskId: 'secret', reason: 'Подсказка' }],
    moves: [
      { taskId: 'today', newDueAt: '2026-10-24T14:00:00Z', reason: 'Нельзя' },
      { taskId: 'secret', newDueAt: '2026-10-25T14:00:00Z', reason: 'Нельзя' },
      { taskId: 'later', newDueAt: '2026-10-25T14:00:00Z', reason: 'Освободить время' }
    ]
  };
  const result = formatSmartDailyCheckup(response, tasks, tomorrow, now, 'Europe/Moscow');
  assert.deepEqual(result.moves.map(m => m.taskId), []);
  const permitted = formatSmartDailyCheckup({ ...response,
    moves: [{ taskId: 'later', newDueAt: '2026-10-25T14:00:00Z', reason: 'Освободить время' }] },
    tasks, tomorrow, now, 'Europe/Moscow');
  assert.equal(permitted.moves.length, 1);
  assert.ok(result.text.includes('🎯 Главные приоритеты'));
  assert.ok(!result.text.includes('secret'));
});

test('daily checkup dynamically settles actual provider token cost and stores it in the general dialog', async () => {
  const billing = await readFile(new URL('../src/services/dynamic-responses-billing.service.ts', import.meta.url), 'utf8');
  const service = await readFile(new URL('../src/services/daily-ai-checkup.service.ts', import.meta.url), 'utf8');
  const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(billing, /daily_checkup: \{ min: 768, max: 4096 \}/);
  assert.match(service, /runDynamicResponsesCall\(/);
  assert.match(service, /settleDynamicResponsesCall\(call\)/);
  assert.match(service, /refundDynamicResponsesCall\(call\)/);
  assert.match(index, /creditsSpentMilli: checkup.creditsSpentMilli/);
  assert.ok(!index.includes('messages: [{ role: \'assistant\', content: text }]'));
});
