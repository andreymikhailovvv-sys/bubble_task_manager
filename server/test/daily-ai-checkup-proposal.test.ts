import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('checkup proposals are durable, owner-bound and always require manual approval', async () => {
  const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  const proposals = await readFile(new URL('../src/services/ai-task-proposal.service.ts', import.meta.url), 'utf8');
  const card = await readFile(new URL('../../client/src/components/AiTaskProposalCard.tsx', import.meta.url), 'utf8');
  assert.match(index, /source: 'daily_checkup', userTimeZone: timeZone, autoApply: false/);
  assert.match(index, /taskProposalId: proposalId/);
  assert.match(index, /requestId: 'daily-checkup:' \+ slot.dateKey/);
  assert.match(index, /operation: 'reschedule'/);
  assert.match(proposals, /row.source === 'daily_checkup'/);
  assert.match(proposals, /where: \{ id, userId, status: 'PENDING' \}/);
  assert.match(card, /proposal.source === 'daily_checkup'/);
  assert.match(card, /!telegram && !checkup/);
  assert.match(card, /api.approveAiTaskProposal\(proposal.id\)/);
  assert.match(card, /api.rejectAiTaskProposal\(proposal.id\)/);
});
