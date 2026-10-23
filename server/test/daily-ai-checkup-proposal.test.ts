import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCheckupSelectedIndices } from '../src/services/ai-task-proposal.service.js';

test('checkup proposals are durable, owner-bound and always require manual approval', async () => {
  const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  const delivery = await readFile(new URL('../src/services/ai-checkup-delivery.service.ts', import.meta.url), 'utf8');
  const proposals = await readFile(new URL('../src/services/ai-task-proposal.service.ts', import.meta.url), 'utf8');
  const card = await readFile(new URL('../../client/src/components/AiTaskProposalCard.tsx', import.meta.url), 'utf8');
  assert.match(delivery, /source: 'daily_checkup'/);
  assert.match(delivery, /autoApply: false/);
  assert.match(delivery, /taskProposalId: proposalId/);
  assert.match(index, /requestId: 'daily-checkup:' \+ local\.dateKey \+ ':' \+ schedule\.id/);
  assert.match(delivery, /operation: 'reschedule'/);
  assert.match(proposals, /row.source === 'daily_checkup'/);
  assert.match(proposals, /where: \{ id, userId, status: 'PENDING' \}/);
  assert.match(card, /proposal.source === 'daily_checkup'/);
  assert.match(card, /!telegram && !checkup/);
  assert.match(card, /api.approveAiTaskProposal\(proposal.id, checkup \? selectedIndices : undefined\)/);
  assert.match(card, /api.rejectAiTaskProposal\(proposal.id\)/);
});

test('checkup selected rows are explicit, unique and in range', () => {
  assert.deepEqual(validateCheckupSelectedIndices([2, 0], 3), [0, 2]);
  for (const indices of [[], undefined, [0, 0], [3], [-1], [1.5], ['0'], '0', [0, 1, 2, 3]]) {
    assert.throws(() => validateCheckupSelectedIndices(indices, 3));
  }
});

test('selection is claimed once, retained for undo, and never accepts browser-provided operations', async () => {
  const service = await readFile(new URL('../src/services/ai-task-proposal.service.ts', import.meta.url), 'utf8');
  const routes = await readFile(new URL('../src/routes/api.ts', import.meta.url), 'utf8');
  const client = await readFile(new URL('../../client/src/components/AiTaskProposalCard.tsx', import.meta.url), 'utf8');
  assert.match(service, /selectedIndices\?: number\[\]/);
  assert.match(service, /const indices = validateCheckupSelectedIndices\(selectedIndices, originalActions.length\)/);
  assert.match(service, /operations: subset.actions as unknown as Prisma.InputJsonValue/);
  assert.match(service, /snapshots: subset.snapshots as unknown as Prisma.InputJsonValue/);
  assert.match(service, /where: \{ id, userId, status: 'PENDING' \}/);
  assert.match(service, /selectedIndices: subset.indices, totalOperations: subset.originalCount/);
  assert.match(routes, /applyTaskProposal\(req.user!.id, req.params.id, selectedIndices\)/);
  assert.match(client, /disabled=\{busy \|\| \(checkup && selectedIndices.length === 0\)\}/);
  assert.match(client, /checked=\{displayedSelection.includes\(index\)\}/);
});
