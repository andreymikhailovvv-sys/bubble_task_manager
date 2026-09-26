import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { createCalendarExportController } from '../src/controllers/calendar-export.controller.js';
import { CALENDAR_EXPORT_PURPOSE, createTaskIcs, signCalendarExportToken } from '../src/services/calendar-export.service.js';

process.env.JWT_SECRET = 'calendar-export-test-secret';
process.env.PUBLIC_APP_URL = 'https://planirovych.example/';

const ownTask = {
  id: 'task-1', userId: 'user-1', title: 'Русская задача;,',
  description: 'Строка 1\nСтрока 2; \\ тест,', location: 'Москва; офис, 1\\2'
};

const repository = (task = ownTask as typeof ownTask | null) => ({
  calls: [] as Array<{ where: { id: string; userId: string } }>,
  async findFirst(args: { where: { id: string; userId: string } }) {
    this.calls.push(args);
    return task && task.id === args.where.id && task.userId === args.where.userId ? task : null;
  }
});

const response = () => {
  const result = { status: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  return { result, res: {
    status(code: number) { result.status = code; return this; },
    json(body: unknown) { result.body = body; return this; },
    set(headers: Record<string, string>) { result.headers = headers; return this; },
    send(body: unknown) { result.body = body; return this; }
  } };
};

const createRequest = (overrides: Record<string, unknown> = {}) => ({
  body: { startAt: '2026-09-27T12:00:00.000Z', durationMinutes: 60, reminderMinutes: 30 },
  params: { id: 'task-1' }, user: { id: 'user-1' }, protocol: 'https', query: {},
  get: (name: string) => name === 'host' ? 'fallback.example' : undefined,
  ...overrides
});

const exportRequest = (token: string) => createRequest({ query: { token } });

test.after(() => {
  delete process.env.JWT_SECRET;
  delete process.env.PUBLIC_APP_URL;
});

test('пользователь получает export URL только для своей задачи', async () => {
  const repo = repository();
  const { result, res } = response();
  await createCalendarExportController(repo).createLink(createRequest() as never, res as never);
  assert.equal(result.status, 200);
  assert.match((result.body as { url: string }).url, /^https:\/\/planirovych\.example\/api\/calendar\/ics\/export\?token=/);
  assert.deepEqual(repo.calls[0].where, { id: 'task-1', userId: 'user-1' });

  const foreign = response();
  await createCalendarExportController(repo).createLink(createRequest({ user: { id: 'user-2' } }) as never, foreign.res as never);
  assert.equal(foreign.result.status, 404);
});

test('валидный token возвращает VEVENT, заголовки, UTC start/end и VALARM', async () => {
  const token = signCalendarExportToken({
    taskId: ownTask.id, userId: ownTask.userId, startAt: '2026-09-27T12:00:00.000Z', durationMinutes: 60, reminderMinutes: 30
  });
  const { result, res } = response();
  await createCalendarExportController(repository()).exportIcs(exportRequest(token) as never, res as never);
  const ics = String(result.body);
  assert.equal(result.headers['Content-Type'], 'text/calendar; charset=utf-8');
  assert.equal(result.headers['Content-Disposition'], 'attachment; filename="planirovych-event.ics"');
  assert.equal(result.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
  assert.match(ics, /BEGIN:VEVENT\r\n/);
  assert.match(ics, /DTSTART:20260927T120000Z\r\nDTEND:20260927T130000Z/);
  assert.match(ics, /TRIGGER:-PT30M/);
  assert.match(ics, /SUMMARY:Русская задача\\;\\,/);
  assert.match(ics, /DESCRIPTION:Строка 1\\nСтрока 2\\; \\\\ тест\\,/);
  assert.match(ics, /LOCATION:Москва\\; офис\\, 1\\\\2/);
  assert.ok(ics.endsWith('\r\n'));
});

test('reminder=null не создаёт VALARM', () => {
  const ics = createTaskIcs(ownTask, { startAt: '2026-09-27T12:00:00.000Z', durationMinutes: 30, reminderMinutes: null });
  assert.doesNotMatch(ics, /VALARM|TRIGGER/);
});

test('истёкший, изменённый и token неправильного назначения отклоняются', async () => {
  const base = { taskId: ownTask.id, userId: ownTask.userId, startAt: '2026-09-27T12:00:00.000Z', durationMinutes: 60, reminderMinutes: 30 };
  const expired = jwt.sign({ ...base, purpose: CALENDAR_EXPORT_PURPOSE }, process.env.JWT_SECRET!, { expiresIn: -1 });
  const wrongPurpose = jwt.sign({ ...base, purpose: 'login' }, process.env.JWT_SECRET!, { expiresIn: 300 });
  const valid = signCalendarExportToken(base);
  const modified = `${valid.slice(0, -1)}${valid.endsWith('a') ? 'b' : 'a'}`;
  for (const token of [expired, wrongPurpose, modified]) {
    const { result, res } = response();
    await createCalendarExportController(repository()).exportIcs(exportRequest(token) as never, res as never);
    assert.equal(result.status, 401);
  }
});

test('public export повторно проверяет taskId вместе с userId', async () => {
  const token = signCalendarExportToken({
    taskId: ownTask.id, userId: 'user-2', startAt: '2026-09-27T12:00:00.000Z', durationMinutes: 60, reminderMinutes: null
  });
  const repo = repository();
  const { result, res } = response();
  await createCalendarExportController(repo).exportIcs(exportRequest(token) as never, res as never);
  assert.equal(result.status, 404);
  assert.deepEqual(repo.calls[0].where, { id: ownTask.id, userId: 'user-2' });
});

test('ics-link отклоняет произвольные duration, reminder и невалидный startAt', async () => {
  for (const body of [
    { startAt: 'не дата', durationMinutes: 60, reminderMinutes: 30 },
    { startAt: '2026-09-27T12:00:00Z', durationMinutes: 45, reminderMinutes: 30 },
    { startAt: '2026-09-27T12:00:00Z', durationMinutes: 60, reminderMinutes: 15 }
  ]) {
    const { result, res } = response();
    await createCalendarExportController(repository()).createLink(createRequest({ body }) as never, res as never);
    assert.equal(result.status, 400);
  }
});
