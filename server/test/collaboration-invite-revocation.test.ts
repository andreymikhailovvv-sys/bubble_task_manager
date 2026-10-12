import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createCollaborationInviteToken } from '../src/lib/collaboration-security.js';

test('share links use independent, unguessable URL-safe bearer tokens', () => {
  const tokens = new Set(Array.from({ length: 32 }, () => createCollaborationInviteToken()));
  assert.equal(tokens.size, 32);
  for (const token of tokens) {
    assert.match(token, /^[A-Za-z0-9_-]{32}$/);
    assert.equal(Buffer.from(token, 'base64url').length, 24);
  }
});

test('excluding a member atomically revokes the old invite token', async () => {
  const source = await readFile(new URL('../src/services/task.service.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  removeCollaborator: async (');
  const end = source.indexOf('  disableCollaboration: async (', start);
  assert.ok(start > 0 && end > start);
  const block = source.slice(start, end);

  assert.match(block, /userId: ownerId, parentTaskId: null/);
  assert.match(block, /if \(memberUserId === ownerId\)/);
  assert.match(block, /await prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(block, /await tx\.collaborativeTaskMember\.delete\(/);
  assert.match(block, /await tx\.collaborativeTask\.update\(/);
  assert.match(block, /data: \{ token: createCollaborationInviteToken\(\) \}/);
  assert.ok(block.indexOf('await tx.collaborativeTaskMember.delete(') < block.indexOf('await tx.collaborativeTask.update('));
  assert.ok(block.indexOf('return { ok: true as const };') > block.indexOf('await prisma.$transaction('));
});

test('accepting a share must confirm token validity inside the transaction before membership upsert', async () => {
  const source = await readFile(new URL('../src/services/task.service.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  acceptShare: async (');
  const end = source.indexOf('  updateCollaboration: async (', start);
  const block = source.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(block, /where: \{ token \}/);
  assert.match(block, /return prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(block, /await tx\.collaborativeTask\.updateMany\(/);
  assert.match(block, /where: \{ id: collaboration\.id, token \}/);
  assert.match(block, /if \(currentInvite\.count !== 1\) throw/);
  assert.match(block, /await tx\.collaborativeTaskMember\.upsert\(/);
  assert.ok(block.indexOf('await tx.collaborativeTask.updateMany(') < block.indexOf('await tx.collaborativeTaskMember.upsert('));
});

test('existing task share creation reuses the current token without rotating on opening the invite dialog', async () => {
  const source = await readFile(new URL('../src/services/task.service.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  createShareLink: async (');
  const end = source.indexOf('  sharePreview: async (', start);
  const block = source.slice(start, end);
  assert.match(block, /token: createCollaborationInviteToken\(\)/);
  assert.match(block, /return \{ token: collaboration\.token \}/);
});
