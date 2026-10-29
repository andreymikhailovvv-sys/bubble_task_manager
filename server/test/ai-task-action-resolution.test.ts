import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorizePlannerActionReferences, type PlannerActionInput } from '../src/services/planner-tools.service.js';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const action = (overrides: Partial<PlannerActionInput>): PlannerActionInput => ({
  operation: 'create_subtask', itemId: null, parentTaskId: 'parent-1',
  title: 'Новая подзадача', description: null, dueDate: null,
  importance: null, urgency: null, notifyBeforeMinutes: null,
  sphereId: null, location: null, ...overrides
});

test('known accessible parent is verified and accepted without repeating model search', async () => {
  const ids = new Set<string>();
  const calls: string[] = [];
  const invalid = await authorizePlannerActionReferences('owner-1', action({}), ids, new Set(), async (userId, id) => {
    calls.push(userId + ':' + id);
    return { id, parentTaskId: null };
  });
  assert.equal(invalid, null);
  assert.deepEqual(calls, ['owner-1:parent-1']);
  assert.equal(ids.has('parent-1'), true);
});

test('missing, inaccessible and nested parent IDs cannot be proposed', async () => {
  for (const lookup of [async () => null, async () => ({ id: 'parent-1', parentTaskId: 'another-task' })]) {
    const ids = new Set<string>();
    const invalid = await authorizePlannerActionReferences('owner-1', action({}), ids, new Set(), lookup);
    assert.equal(invalid?.code, 'ITEM_NOT_RESOLVED');
    assert.equal(ids.size, 0);
  }
});

test('trusted task ID still requires a valid operation payload', async () => {
  const invalid = await authorizePlannerActionReferences('owner-1', action({ title: '' }), new Set(), new Set(), async (_u, id) => ({ id, parentTaskId: null }));
  assert.equal(invalid?.code, 'TITLE_REQUIRED');
});

test('task-chat proposals preserve planner action shape and verified IDs for later approval', () => {
  const proposal = source('../src/services/ai-task-proposal.service.ts');
  const taskChat = source('../src/services/ai-assistant.service.ts');
  const workspace = source('../src/services/task-chat-workspace-tools.service.ts');
  const generalChat = source('../src/services/ai-chat-tools.service.ts');
  assert.match(proposal, /row.source === 'task_chat' \|\| row.source === 'telegram_bot_task'/);
  assert.match(proposal, /typeof action.operation !== 'string'/);
  assert.match(proposal, /actions: \[action\], userTimeZone: row.userTimeZone/);
  assert.match(proposal, /await plannerToolsService.action\(/);
  assert.match(taskChat, /resolvedItemIds: \[\.\.\.workspaceTools.resolvedItemIds\]/);
  assert.match(taskChat, /resolvedSphereIds: \[\.\.\.workspaceTools.resolvedSphereIds\]/);
  assert.match(workspace, /new Set<string>\(\[input.taskId\]\)/);
  assert.match(workspace, /authorizePlannerActionReferences/);
  assert.match(generalChat, /authorizePlannerActionReferences/);
  const staged = generalChat.indexOf('preparedTaskActions.push(action);');
  const validated = generalChat.lastIndexOf('authorizePlannerActionReferences', staged);
  assert.ok(staged > validated && validated > 0);
});
