import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const taskServiceSource = async () =>
  readFile(new URL('../src/services/task.service.ts', import.meta.url), 'utf8');

test('creating a task checks sphere ownership before any insertion', async () => {
  const source = await taskServiceSource();
  const creation = source.slice(source.indexOf('  create: async (userId:'), source.indexOf('  update: async (id:'));
  assert.ok(creation.includes("await prisma.sphere.findFirstOrThrow({ where: { id: input.sphereId, userId } });"));
  assert.ok(creation.indexOf('prisma.sphere.findFirstOrThrow') < creation.indexOf('prisma.task.create'));
  // Collaborative parents remain accessible by membership, not just userId.
  assert.match(creation, /collaboration: \{ members: \{ some: \{ userId \} \} \}/);
  assert.match(creation, /collaboration: parent\?\.collaborationId/);
});

test('updating sphere and parent references scopes IDs before side effects', async () => {
  const source = await taskServiceSource();
  const update = source.slice(source.indexOf('  update: async (id:'), source.indexOf('  remove: async (id:'));
  assert.match(update, /await prisma\.sphere\.findFirstOrThrow\(\{ where: \{ id: input\.sphereId, userId \} \}\)/);
  assert.match(update, /id: \{ equals: input\.parentTaskId, not: id \}/);
  assert.match(update, /parentTaskId: null/);
  assert.match(update, /collaborationId: currentTask\.collaborationId/);
  assert.match(update, /collaboration: \{ members: \{ some: \{ userId \} \} \}/);
  assert.match(update, /\{ collaborationId: null, userId \}/);
  assert.ok(update.indexOf('await prisma.task.findFirstOrThrow') < update.indexOf('collaborativeTaskMember.update('));
  assert.ok(update.indexOf('await prisma.task.findFirstOrThrow') < update.indexOf('prisma.$transaction('));
  assert.match(update, /patch\.parentTask = input\.parentTaskId \? \{ connect: \{ id: input\.parentTaskId \} \}/);
});

test('valid private and shared relation writes still use unchanged Prisma connect semantics', async () => {
  const source = await taskServiceSource();
  assert.match(source, /sphere: input\.sphereId \? \{ connect: \{ id: input\.sphereId \} \}/);
  assert.match(source, /parentTask: !isEvent && input\.parentTaskId \? \{ connect: \{ id: input\.parentTaskId \} \}/);
  assert.match(source, /patch\.sphere = input\.sphereId \? \{ connect: \{ id: input\.sphereId \} \} : \{ disconnect: true \}/);
});
