import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildDailyCheckupPayload, buildCheckupProposalRecoveryPayload, formatSmartDailyCheckup, parseDailyCheckupResponse } from '../src/services/daily-ai-checkup.service.js';
import { completeCheckupScheduleMoves } from '../src/services/daily-ai-checkup-schedule.service.js';

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
  assert.ok(result.text.includes('📋 Сводка от сервера'));
  assert.ok(result.text.includes('🤖 Общий блок от ИИ'));
  assert.ok(result.text.includes('🗓️ Предложенные изменения от ИИ'));
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

test('checkup keeps user sector instructions and applies them only to matching task sector', async () => {
  const context = {
    date: '2026-10-22T16:00:00Z', timeZone: 'Europe/Moscow',
    tasks: [
      { id: 'museum', title: 'Обновить афишу', sphereId: 'museum-sector', dueDate: null },
      { id: 'personal', title: 'Зарядка', sphereId: 'personal-sector', dueDate: null },
      { id: 'unassigned', title: 'Другое', sphereId: null, dueDate: null }
    ],
    sectors: [
      { id: 'museum-sector', name: 'Музей', instructions: 'Сначала проверять даты мероприятий' },
      { id: 'personal-sector', name: 'Личное', instructions: 'Не назначать тренировки поздно вечером' }
    ]
  };
  for (const payload of [
    buildDailyCheckupPayload(context, 'gpt-6-luna'),
    buildCheckupProposalRecoveryPayload(context, { priorities: [], workload: 'Есть дела' }, 'gpt-6-luna')
  ]) {
    const instructions = payload.input[0].content;
    const data = JSON.parse(payload.input[1].content);
    assert.match(instructions, /sector|сектор/i);
    assert.match(instructions, /instructions/);
    assert.match(instructions, /sphereId/);
    const museumTask = data.tasks?.find((task: { id: string }) => task.id === 'museum') ??
      data.context.tasks.find((task: { id: string }) => task.id === 'museum');
    const personalTask = data.tasks?.find((task: { id: string }) => task.id === 'personal') ??
      data.context.tasks.find((task: { id: string }) => task.id === 'personal');
    const sectors = data.sectors ?? data.context.sectors;
    assert.equal(museumTask.sphereId, 'museum-sector');
    assert.equal(personalTask.sphereId, 'personal-sector');
    assert.equal(sectors[0].instructions, 'Сначала проверять даты мероприятий');
    assert.equal(sectors[1].instructions, 'Не назначать тренировки поздно вечером');
  }
  const service = await readFile(new URL('../src/services/daily-ai-checkup.service.ts', import.meta.url), 'utf8');
  assert.match(service, /prisma\.sphere\.findMany\(\{ where: \{ userId \}/);
  assert.match(service, /select: \{ id: true, name: true, generalPrompt: true \}/);
  assert.match(service, /sphereId: true/);
  assert.match(service, /sphereId: t\.sphereId \?\? null/);
  assert.match(service, /instructions: sector\.generalPrompt\?\.trim\(\) \|\| null/);
});

test('three checkup blocks: exact three-hour deadline window, all-day events, and concise server moves', () => {
  const now = new Date('2026-10-27T08:00:00Z');
  const tomorrow = new Date('2026-10-28T00:00:00Z');
  const items = [
    { id: 't1', title: 'Собрать письмо', dueDate: '2026-10-27T10:45:00Z', taskType: 'TASK' },
    { id: 'sub', title: 'Подготовить таблицу', parentTaskId: 't1', dueDate: '2026-10-27T11:00:00Z', taskType: 'TASK' },
    { id: 't2', title: 'Вечерняя задача', dueDate: '2026-10-27T15:00:00Z', taskType: 'TASK' },
    { id: 'event', title: 'Конференция', dueDate: '2026-10-27T17:00:00Z', taskType: 'EVENT' },
    { id: 'reminder', title: 'Позвонить', dueDate: '2026-10-27T07:00:00Z', taskType: 'REMINDER' },
    { id: 'next', title: 'Завтрашнее событие', dueDate: '2026-10-28T17:00:00Z', taskType: 'EVENT' }
  ];
  const report = formatSmartDailyCheckup({ summary: 'Сосредоточьтесь на письме.', moves: [
    { taskId: 't2', newDueAt: '2026-10-28T12:00:00Z', reason: 'Снизить нагрузку' },
    { taskId: 'event', newDueAt: '2026-10-28T13:00:00Z', reason: 'Нельзя' }
  ] }, items, tomorrow, now, 'Europe/Moscow');
  assert.ok(report.text.includes('Собрать письмо'));
  assert.ok(report.text.includes('Подготовить таблицу'));
  assert.ok(report.text.includes('Конференция'));
  assert.ok(report.text.includes('Позвонить'));
  assert.ok(!report.text.includes('Вечерняя задача —'));
  assert.ok(!report.text.includes('Завтрашнее событие'));
  assert.deepEqual(report.moves.map(x => x.taskId), ['t2']);
  assert.equal(report.text.split('📋 Ближайшие задачи').length, 2);
  assert.equal(report.text.split('💡 Рекомендации').length, 2);
  assert.doesNotMatch(report.text, /Сводка от сервера|Общий блок от ИИ|Предложенные изменения от ИИ/);
  assert.doesNotMatch(report.text, /перенос на 28/);
});

test('server proposes every overdue task and subtask, distributes dense deadlines into 15-minute slots', () => {
  const now = new Date('2026-10-27T08:02:00.000Z');
  const items = [
    { id: 'high', title: 'Срочная просрочка', dueDate: '2026-10-26T12:00:00Z', taskType: 'TASK', importance: 5 },
    { id: 'low', title: 'Низкая просрочка', dueDate: '2026-10-26T12:00:00Z', taskType: 'TASK', importance: 2 },
    { id: 'sub', title: 'Просроченная подзадача', dueDate: '2026-10-27T07:00:00Z', taskType: 'TASK', importance: 4, parentTaskId: 'high' },
    { id: 'a', title: 'Дело А', dueDate: '2026-10-27T13:00:00Z', taskType: 'TASK' },
    { id: 'b', title: 'Дело Б', dueDate: '2026-10-27T13:00:00Z', taskType: 'TASK' },
    { id: 'c', title: 'Дело В', dueDate: '2026-10-27T13:00:00Z', taskType: 'TASK' },
    { id: 'event', title: 'Событие', dueDate: '2026-10-27T13:45:00Z', taskType: 'EVENT' },
    { id: 'reminder', title: 'Напоминание', dueDate: '2026-10-26T10:00:00Z', taskType: 'REMINDER' }
  ];
  const moves = completeCheckupScheduleMoves([], items, now, 'Europe/Moscow');
  assert.deepEqual(['high', 'low', 'sub'].every(id => moves.some(m => m.taskId === id)), true);
  assert.ok(!moves.some(m => m.taskId === 'event' || m.taskId === 'reminder'));
  const original = new Map(items.map(t => [t.id, t.dueDate]));
  const scheduled = items.filter(t => t.taskType === 'TASK').map(t =>
    Date.parse(moves.find(m => m.taskId === t.id)?.newDueAt ?? original.get(t.id)!));
  for (let i = 0; i < scheduled.length; i++) {
    for (let j = i + 1; j < scheduled.length; j++) {
      assert.ok(Math.abs(scheduled[i] - scheduled[j]) >= 15 * 60_000,
        'all scheduled tasks must be at least 15 minutes apart');
    }
  }
  const nextLocalDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
  assert.notEqual(nextLocalDate(moves.find(m => m.taskId === 'low')!.newDueAt), nextLocalDate(now.toISOString()));
  assert.equal(nextLocalDate(moves.find(m => m.taskId === 'high')!.newDueAt), nextLocalDate(now.toISOString()));
  const unchanged = items.find(t => t.id === 'a')!.dueDate;
  const allTime = ['a', 'b', 'c'].map(id => Date.parse(moves.find(m => m.taskId === id)?.newDueAt ?? original.get(id)!));
  assert.ok(allTime.includes(Date.parse(unchanged!)));
  assert.equal(new Set(allTime).size, 3);
});

test('checkup includes every overdue subtask without 45-row root-only pagination', async () => {
  const service = await readFile(new URL('../src/services/daily-ai-checkup.service.ts', import.meta.url), 'utf8');
  assert.match(service, /const \[tasks, undated, dayEvents, done, events, habits, sectors\]/);
  assert.match(service, /parentTaskId: true/);
  assert.match(service, /taskType: 'TASK'/);
  assert.match(service, /completeCheckupScheduleMoves\(output.moves, compact, now, timeZone\)/);
  assert.match(service, /resolveAiCheckupSchedules\(user.aiCheckupSchedules, user.morningAiCheckupTime\)/);
  assert.match(service, /checkupSchedules: configuredCheckups.map/);
  assert.doesNotMatch(service, /orderBy: \[\{ dueDate: 'asc' \}, \{ importance: 'desc' \}],[ ]*take: 45/);
  const prompt = buildDailyCheckupPayload({ tasks: [], checkupInstructions: 'Мои пожелания' }, 'gpt-6-luna');
  assert.match(prompt.input[0].content, /400 до 600 символов/);
  assert.match(prompt.input[0].content, /СЛЕДУЙ/);
  assert.match(prompt.input[0].content, /НЕ переноси автоматически вечерние задачи на утро/);
  assert.match(prompt.input[0].content, /15 минут/);
  assert.match(prompt.input[0].content, /подзадач/);
  assert.deepEqual(prompt.text.format.schema.required, ['summary', 'moves']);
});

test('server preserves overdue tasks original evening and daytime hours, respects model preferences', () => {
  const now = new Date('2026-10-27T08:00:00Z'); // 11:00 Europe/Moscow
  const items = [
    { id: 'evening', title: 'Личное вечером', dueDate: '2026-10-26T18:00:00Z', taskType: 'TASK', importance: 2 },
    { id: 'day', title: 'Рабочее днём', dueDate: '2026-10-26T11:00:00Z', taskType: 'TASK', importance: 5 },
    { id: 'strict', title: 'Перенос ИИ', dueDate: '2026-10-26T15:00:00Z', taskType: 'TASK', importance: 3 }
  ];
  const requested = '2026-10-29T17:00:00.000Z';
  const moves = completeCheckupScheduleMoves([
    { taskId: 'strict', newDueAt: requested, reason: 'Пожелание пользователя' }
  ], items, now, 'Europe/Moscow');
  const time = (id: string) => {
    const move = moves.find(x => x.taskId === id);
    assert.ok(move, id);
    return new Date(move.newDueAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false });
  };
  assert.equal(time('evening'), '21:00');
  assert.equal(time('day'), '14:00');
  assert.equal(moves.find(x => x.taskId === 'strict')?.newDueAt, requested);
});

test('saved checkup field instructions and sectors are priorities in both AI passes', () => {
  const input = {
    date: '2026-10-29T16:00:00Z', timeZone: 'Europe/Moscow',
    checkupInstructions: 'Не ставь созвоны позже 18:00',
    checkupSchedules: [{ time: '10:00', instructions: 'Оцени рабочие задачи' }, { time: '20:00', instructions: 'Личные дела вечером' }],
    sectors: [{ id: 'personal', name: 'Личные', instructions: 'Личное после работы' }],
    tasks: [{ id: 't1', title: 'Встреча', sphereId: 'personal', dueDate: '2026-10-28T17:00:00Z' }]
  };
  for (const payload of [
    buildDailyCheckupPayload(input, 'gpt-6-luna'),
    buildCheckupProposalRecoveryPayload(input, { summary: 'Расписание' }, 'gpt-6-luna')
  ]) {
    const system = payload.input[0].content;
    const user = payload.input[1].content;
    assert.match(system, /checkupSchedules/);
    assert.match(system, /checkupInstructions/);
    assert.match(system, /sectors/);
    assert.match(system, /время суток/);
    assert.match(user, /Личные дела вечером/);
    assert.match(user, /Личное после работы/);
    assert.match(user, /Не ставь созвоны позже 18:00/);
  }
});
