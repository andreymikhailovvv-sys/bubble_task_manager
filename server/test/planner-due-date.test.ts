import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { normalizePlannerDueDate } from '../src/services/planner-due-date.service.js';
import { validatePlannerActionResolution } from '../src/services/planner-tools.service.js';

const mondayInMoscow = new Date('2026-10-19T14:48:00.000Z');
const moscow = 'Europe/Moscow';
const asTask = (date: string | null) => ({
  operation: 'create_task' as const, itemId: null, parentTaskId: null, title: 'Закупить два компьютера для новых сотрудников',
  description: null, dueDate: date, importance: null, urgency: null,
  notifyBeforeMinutes: null, sphereId: null, location: null
});

test('голосовое «на вторник» получает срок конца ближайшего вторника, а не INVALID_DUE_DATE', () => {
  const expected = '2026-10-20T20:59:00.000Z';
  for (const raw of ['вторник', 'во вторник', 'на вторник', 'ближайший вторник', '2026-10-20']) {
    const dueDate = normalizePlannerDueDate(raw, moscow, mondayInMoscow);
    assert.equal(dueDate, expected, raw);
    assert.equal(validatePlannerActionResolution(asTask(dueDate), new Set(), new Set()), null, raw);
  }
});

test('явное время, ISO с offset и завтра сохраняют указанное локальное время', () => {
  assert.equal(normalizePlannerDueDate('на вторник в 14:30', moscow, mondayInMoscow), '2026-10-20T11:30:00.000Z');
  assert.equal(normalizePlannerDueDate('2026-10-20T14:30', moscow, mondayInMoscow), '2026-10-20T11:30:00.000Z');
  assert.equal(normalizePlannerDueDate('2026-10-20 14:30:00', moscow, mondayInMoscow), '2026-10-20T11:30:00.000Z');
  assert.equal(normalizePlannerDueDate('2026-10-20T14:30:00+03:00', moscow, mondayInMoscow), '2026-10-20T11:30:00.000Z');
  assert.equal(normalizePlannerDueDate('завтра', moscow, mondayInMoscow), '2026-10-20T20:59:00.000Z');
  assert.equal(normalizePlannerDueDate(null, moscow, mondayInMoscow), null);
});

test('время пользователя учитывает сезонные смещения, а не всегда московское UTC+3', () => {
  assert.equal(normalizePlannerDueDate('2026-03-08', 'America/New_York'), '2026-03-09T03:59:00.000Z');
  assert.equal(normalizePlannerDueDate('2026-01-15', 'America/New_York'), '2026-01-16T04:59:00.000Z');
});

test('неточные и невозможные даты не превращаются в случайные сроки', () => {
  for (const value of ['2026-02-29', '2026-04-31', '2026-10-20T25:00', 'когда-нибудь потом', '2026-03-08T02:30']) {
    const zone = value === '2026-03-08T02:30' ? 'America/New_York' : moscow;
    assert.equal(normalizePlannerDueDate(value, zone, mondayInMoscow), value, value);
  }
  const bad = validatePlannerActionResolution(asTask('2026-02-29'), new Set(), new Set());
  assert.equal(bad?.code, 'INVALID_DUE_DATE');
});

test('запрос на прошедший сегодня вторник переходит на следующий вторник', () => {
  const tuesdayLate = new Date('2026-10-20T21:30:00.000Z'); // 00:30 Wednesday MSK
  assert.equal(normalizePlannerDueDate('во вторник', moscow, tuesdayLate), '2026-10-27T20:59:00.000Z');
});

test('в общем чате даты нормализуются ДО записи предложения, после FAILED нет ложного «Принять»', async () => {
  const [tools, assistant, telegram] = await Promise.all([
    readFile(new URL('../src/services/ai-chat-tools.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/telegram.service.ts', import.meta.url), 'utf8')
  ]);
  assert.match(tools, /const action: PlannerActionInput = \{ \.\.\.original,[\s\S]*?normalizePlannerDueDate/);
  assert.match(tools, /preparedTaskActions\.push\(action\)/);
  assert.match(tools, /taskProposal\.status === 'PENDING'[\s\S]*?Просмотрите карточку/);
  assert.match(tools, /Изменения не применены:/);
  assert.match(assistant, /Если пользователь назвал только день недели, определи календарную дату/);
  assert.match(telegram, /userTimeZone,\s*autoApplyTaskActions: true/);
});
