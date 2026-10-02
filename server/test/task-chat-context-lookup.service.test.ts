import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/db/prisma.js';
import { executeTaskContextLookup } from '../src/services/task-chat-context-lookup.service.js';

type StubSubtask = {
  id: string;
  title: string;
  description: string | null;
  status: 'TODO' | 'DONE';
  dueDate: Date | null;
  createdAt: Date;
};

function installTaskStubs(t: Parameters<typeof test>[1] extends (context: infer T) => unknown ? T : never, subtasks: StubSubtask[]) {
  const filtered = (where: { status?: 'DONE' | { not: 'DONE' } }) => where.status === 'DONE'
    ? subtasks.filter((item) => item.status === 'DONE')
    : where.status && typeof where.status === 'object'
      ? subtasks.filter((item) => item.status !== 'DONE')
      : subtasks;
  const taskDelegate = prisma.task as unknown as { count: unknown; findMany: unknown };
  const originalCount = taskDelegate.count;
  const originalFindMany = taskDelegate.findMany;
  taskDelegate.count = async ({ where }: { where: { status?: 'DONE' | { not: 'DONE' } } }) => filtered(where).length;
  taskDelegate.findMany = async ({ where, skip = 0, take }: { where: { status?: 'DONE' | { not: 'DONE' } }; skip?: number; take?: number }) => {
    const matches = filtered(where);
    return typeof take === 'number' ? matches.slice(skip, skip + take) : matches;
  };
  t.after(() => { taskDelegate.count = originalCount; taskDelegate.findMany = originalFindMany; });
}

function makeSubtasks(count: number): StubSubtask[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `subtask-${index + 1}`,
    title: index === count - 1 ? `Telegram ${index + 1}` : `Подзадача ${index + 1}`,
    description: index === 0 ? 'x'.repeat(700) : null,
    status: 'TODO',
    dueDate: null,
    createdAt: new Date(2026, 0, index + 1)
  }));
}

const lookup = (args: Parameters<typeof executeTaskContextLookup>[0]['args']) => executeTaskContextLookup({
  userId: 'user-1',
  taskId: 'task-1',
  isSubtaskChat: false,
  args
});

test('list_subtasks передаёт модели все 72 активные подзадачи одной страницей', async (t) => {
  installTaskStubs(t, makeSubtasks(72));
  const { result } = await lookup({ operation: 'list_subtasks', status: 'active', offset: 0, limit: 100 });
  assert.equal(result.ok, true);
  assert.equal('total' in result && result.total, 72);
  assert.equal('count' in result && result.count, 72);
  assert.equal('hasMore' in result && result.hasMore, false);
  assert.equal('subtasks' in result && result.subtasks.length, 72);
  assert.equal('subtasks' in result && result.subtasks[0]?.descriptionPreview?.length, 500);
});

test('list_subtasks пагинирует 150 подзадач без потерь и дублей', async (t) => {
  installTaskStubs(t, makeSubtasks(150));
  const first = (await lookup({ operation: 'list_subtasks', status: 'active', offset: 0, limit: 100 })).result;
  assert.equal('hasMore' in first && first.hasMore, true);
  assert.equal('nextOffset' in first && first.nextOffset, 100);
  const second = (await lookup({ operation: 'list_subtasks', status: 'active', offset: 100, limit: 100 })).result;
  assert.equal('count' in second && second.count, 50);
  assert.equal('hasMore' in second && second.hasMore, false);
  const ids = [...('subtasks' in first ? first.subtasks : []), ...('subtasks' in second ? second.subtasks : [])].map((item) => item.id);
  assert.equal(ids.length, 150);
  assert.equal(new Set(ids).size, 150);
});

test('search_subtasks остаётся точечным поиском максимум по 10 совпадений', async (t) => {
  const subtasks = makeSubtasks(25).map((item) => ({ ...item, title: `Telegram ${item.id}` }));
  installTaskStubs(t, subtasks);
  const { result } = await lookup({ operation: 'search_subtasks', query: 'Telegram', status: 'active' });
  assert.equal('totalMatches' in result && result.totalMatches, 25);
  assert.equal('results' in result && result.results.length, 10);
});
