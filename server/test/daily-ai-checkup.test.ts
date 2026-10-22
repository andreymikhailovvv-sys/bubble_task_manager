import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildDailyCheckupPayload, buildCheckupProposalRecoveryPayload, formatSmartDailyCheckup, parseDailyCheckupResponse } from '../src/services/daily-ai-checkup.service.js';

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

test('checkup may propose today, overdue and earlier reschedules, never unknown tasks or past dates', () => {
  const now = new Date('2026-10-22T08:00:00Z');
  const tomorrow = new Date('2026-10-23T00:00:00Z');
  const tasks = [
    { id: 'today', title: 'Сегодня', dueDate: '2026-10-22T15:00:00Z' },
    { id: 'later', title: 'На неделе', dueDate: '2026-10-24T12:00:00Z' },
    { id: 'overdue', title: 'Просрочена', dueDate: '2026-10-20T14:00:00Z' },
    { id: 'undated', title: 'Без срока', dueDate: null }
  ];
  const result = formatSmartDailyCheckup({
    greeting: 'Добрый день', workload: 'Три дела', risks: ['Высокая нагрузка'],
    insight: '', nextStep: 'Начать с главного',
    priorities: [{ taskId: 'later', reason: 'Важное' }, { taskId: 'secret', reason: 'Неизвестная задача' }],
    moves: [
      { taskId: 'today', newDueAt: '2026-10-23T14:00:00Z', reason: 'Освободить вечер' },
      { taskId: 'secret', newDueAt: '2026-10-25T14:00:00Z', reason: 'Неизвестно' },
      { taskId: 'later', newDueAt: '2026-10-23T12:00:00Z', reason: 'Сделать раньше' },
      { taskId: 'overdue', newDueAt: '2026-10-22T14:00:00Z', reason: 'Вернуть в план' },
      { taskId: 'undated', newDueAt: '2026-10-22T16:00:00Z', reason: 'Выделить время' },
      { taskId: 'today', newDueAt: '2026-10-25T14:00:00Z', reason: 'Дубль' },
      { taskId: 'later', newDueAt: '2026-10-21T12:00:00Z', reason: 'Прошедшее время' }
    ]
  }, tasks, tomorrow, now, 'Europe/Moscow');
  assert.deepEqual(result.moves.map(m => m.taskId), ['today', 'later', 'overdue', 'undated']);
  assert.ok(result.text.includes('🎯 Главные приоритеты'));
  assert.ok(result.text.startsWith('✨ ИИ-чекап'));
  assert.ok(!result.text.includes('secret'));
});

test('daily checkup dynamically settles actual provider token cost and stores it in the general dialog', async () => {
  const billing = await readFile(new URL('../src/services/dynamic-responses-billing.service.ts', import.meta.url), 'utf8');
  const service = await readFile(new URL('../src/services/daily-ai-checkup.service.ts', import.meta.url), 'utf8');
  const delivery = await readFile(new URL('../src/services/ai-checkup-delivery.service.ts', import.meta.url), 'utf8');
  assert.match(billing, /daily_checkup: \{ min: 768, max: 4096 \}/);
  assert.match(service, /runDynamicResponsesCall\(/);
  assert.match(service, /settleDynamicResponsesCall\(call\)/);
  assert.match(service, /refundDynamicResponsesCall\(call\)/);
  assert.match(delivery, /creditsSpentMilli: checkup.creditsSpentMilli/);
  assert.match(delivery, /appendGeneralDialogAssistantMessage/);
  assert.ok(!delivery.includes('messages: [{ role: \'assistant\', content: text }]'));
});

test('missing actionable moves triggers an AI-focused second review without fabricated operations', async () => {
  const context = {
    date: '2026-10-22T16:00:00Z', timeZone: 'Europe/Moscow',
    tasks: [{ id: 'late', title: 'Просроченное дело', dueDate: '2026-10-19T12:00:00Z' }]
  };
  const payload = buildCheckupProposalRecoveryPayload(context, {
    priorities: [{ taskId: 'late', reason: 'Просрочено' }],
    risks: ['Срок уже прошёл'], workload: 'Один просроченный срок',
    nextStep: 'Разобрать просроченное'
  }, 'gpt-6-luna');
  assert.equal(payload.store, false);
  assert.equal(payload.tool_choice, 'none');
  assert.equal(payload.text.format.strict, true);
  assert.equal(payload.text.format.name, 'checkup_action_review');
  assert.deepEqual(payload.text.format.schema.required, ['moves', 'noChangesReason']);
  assert.ok(payload.input[1].content.includes('Просроченное дело'));

  const source = await readFile(new URL('../src/services/daily-ai-checkup.service.ts', import.meta.url), 'utf8');
  assert.match(source, /if \(compact.length > 0 && output.moves.length === 0\)/);
  assert.match(source, /providerCallIndex: attempt \+ 2/);
  assert.match(source, /settleDynamicResponsesCall\(recoveryCall\)/);
  assert.match(source, /creditsSpentMilli \+= recoverySettlement.chargedMilli/);
  assert.match(source, /if \(recovered.moves.length\)/);
  assert.match(source, /refundDynamicResponsesCall\(recoveryCall\)/);
  assert.match(source, /phase: 'initial'/);
  assert.match(source, /phase: 'focused'/);
});

test('checkup does not arbitrarily discard a useful action list after twelve rows', () => {
  const now = new Date('2026-10-22T12:00:00.000Z');
  const tasks = Array.from({ length: 18 }, (_, i) => ({
    id: 'task-' + i, title: 'Задача ' + i, dueDate: null
  }));
  const result = formatSmartDailyCheckup({
    greeting: 'Добрый день', workload: 'Нагрузка высокая',
    risks: [], insight: '', nextStep: 'Распределить задачи', priorities: [],
    moves: tasks.map((task, i) => ({
      taskId: task.id, newDueAt: new Date(now.getTime() + (i + 1) * 3600000).toISOString(),
      reason: 'Разгрузить день'
    }))
  }, tasks, new Date('2026-10-23T00:00:00Z'), now, 'Europe/Moscow');
  assert.equal(result.moves.length, 18);
});

test('manual checkup does not silently disguise failed approval-card creation as no suggestions', async () => {
  const delivery = await readFile(new URL('../src/services/ai-checkup-delivery.service.ts', import.meta.url), 'utf8');
  assert.match(delivery, /const reportText = checkup.moves.length && !proposalId/);
  assert.match(delivery, /Предложения сформированы, но карточку подтверждения не удалось сохранить/);
  assert.match(delivery, /proposedActions: checkup.moves.length/);
});
