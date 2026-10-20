import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { formatTaskReportEvidence, sortedTaskReportTimeline, TASK_REPORT_MODEL } from '../src/services/task-completion-report.service.js';

test('task report chronology preserves chronological order and distinguishes source types', () => {
  const events = [
    { occurredAt: new Date('2026-10-16T12:00:00Z'), kind: 'Ответ ИИ', text: 'Обсуждение результата' },
    { occurredAt: new Date('2026-10-14T12:00:00Z'), kind: 'Создание задачи', text: 'Документ' },
    { occurredAt: new Date('2026-10-15T12:00:00Z'), kind: 'Изменение статуса', text: 'TODO → DONE' }
  ];
  assert.deepEqual(sortedTaskReportTimeline(events).map(v => v.kind),
    ['Создание задачи', 'Изменение статуса', 'Ответ ИИ']);
  const context = formatTaskReportEvidence(events, 'Europe/Moscow');
  assert.ok(context.text.indexOf('Создание задачи') < context.text.indexOf('Изменение статуса'));
  assert.match(context.text, /TODO → DONE/);
  assert.equal(context.omitted, 0);
});

test('task report explicitly reports truncated evidence and does not fabricate missing dates', () => {
  const events = Array.from({length: 12}, (_,i) => ({ occurredAt: new Date(1760000000000+i*60000),
    kind: 'Обсуждение', text: 'Длинный текст'.repeat(30) }));
  const truncated = formatTaskReportEvidence(events, 'Europe/Moscow', 360);
  assert.ok(truncated.omitted > 0);
  assert.equal(TASK_REPORT_MODEL, 'gpt-6-luna');
});

test('task report has server authorization, token billing and document attachment', async () => {
  const [service, routes, schema, taskService, app, mini, api] = await Promise.all([
    readFile(new URL('../src/services/task-completion-report.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/task.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/api.ts', import.meta.url), 'utf8')
  ]);
  assert.match(service, /taskAccessWhere\(input\.userId\)/);
  assert.match(service, /runDynamicResponsesCall/);
  assert.match(service, /settleDynamicResponsesCall/);
  assert.match(service, /refundDynamicResponsesCall/);
  assert.match(service, /wordDocumentService\.create/);
  assert.match(service, /generatedDocumentId: document\.id/);
  assert.match(service, /не придумывай скрытые рассуждения/);
  assert.match(service, /нет достоверной даты в журнале/);
  assert.match(routes, /post\('\/tasks\/:id\/completion-report', requireAuth/);
  assert.match(schema, /model TaskActivityEvent/);
  assert.match(schema, /offerTaskCompletionReport Boolean @default\(true\)/);
  assert.match(taskService, /tx\.taskActivityEvent\.create/);
  assert.match(taskService, /tx\.taskActivityEvent\.createMany/);
  assert.match(app, /<TaskCompletionReportDialog/);
  assert.match(mini, /<TaskCompletionReportDialog/);
  assert.match(api, /generateTaskCompletionReport/);
});
