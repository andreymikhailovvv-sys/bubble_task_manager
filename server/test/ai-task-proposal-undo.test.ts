import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Telegram text and voice calls force task auto-apply and persist their proposal references', () => {
  const telegram = source('../src/services/telegram.service.ts');
  const ai = source('../src/services/ai-assistant.service.ts');
  const tools = source('../src/services/ai-chat-tools.service.ts');
  assert.match(telegram, /telegram-voice:/);
  assert.match(telegram, /telegram-text:/);
  assert.match(telegram, /telegram-task:/);
  assert.ok((telegram.match(/autoApplyTaskActions: true/g) ?? []).length >= 3);
  assert.ok((telegram.match(/taskProposalId: result\.taskProposal\?\.id/g) ?? []).length >= 3);
  assert.match(ai, /autoApply: input\.autoApplyTaskActions === true \? true : undefined/);
  assert.match(tools, /source: input\.autoApplyTaskActions \? 'telegram_bot' : 'planner'/);
  assert.match(telegram, /recordAppliedTelegramBotTask/);
  assert.match(telegram, /telegram-create:/);
  assert.match(source('../src/services/ai-task-proposal.service.ts'), /status: 'APPLIED',[\s\S]*undoData: undoData/);
});

test('undo is owner-scoped, one-shot and rejects data added after AI actions', () => {
  const service = source('../src/services/ai-task-proposal.service.ts');
  const reversal = source('../src/services/ai-task-proposal-undo.service.ts');
  const api = source('../src/routes/api.ts');
  assert.match(api, /task-proposals\/:id\/undo', requireAuth, taskProposalSameOrigin/);
  assert.match(service, /captureProposalBefore/);
  assert.match(service, /captureProposalAfter/);
  assert.match(reversal, /status: 'APPLIED'/);
  assert.match(reversal, /status: 'UNDOING'/);
  assert.match(reversal, /status: 'UNDONE'/);
  assert.match(reversal, /await prisma\.\$transaction\(async tx =>/);
  assert.match(reversal, /createdState/);
  assert.match(reversal, /untrackedChildren/);
  assert.match(reversal, /updatedAt: new Date\(applied\.updatedAt\)/);
});

test('user sees undo action and human-friendly localized dates', () => {
  const component = source('../../client/src/components/AiTaskProposalCard.tsx');
  assert.match(component, /Intl\.DateTimeFormat\('ru-RU'/);
  assert.match(component, /humanDescription\(item\)/);
  assert.match(component, /api\.undoAiTaskProposal\(proposal\.id\)/);
  assert.match(component, /Вернуть\s*<\/button>/);
  assert.doesNotMatch(component, /<span>\{item\.before\}<\/span>/);
});

test('note edits are displayed in the shared proposal on web and Mini App, not committed during AI tool execution', () => {
  const tools = source('../src/services/ai-chat-tools.service.ts');
  const proposal = source('../src/services/ai-task-proposal.service.ts');
  const undo = source('../src/services/ai-task-proposal-undo.service.ts');
  const card = source('../../client/src/components/AiTaskProposalCard.tsx');
  const web = source('../../client/src/App.tsx');
  const mini = source('../../client/src/MiniApp.tsx');
  const noteBlock = tools.slice(tools.indexOf("if (name === 'update_note')"), tools.indexOf("if (name === 'search_workspace')"));
  assert.match(noteBlock, /validateAiUpdateNoteArgs\(value\)/);
  assert.match(noteBlock, /preparedTaskActions\.push\(\{ operation: 'update_note', \.\.\.edit, expectedUpdatedAt \}\)/);
  assert.doesNotMatch(noteBlock, /aiPersonalNotesService\.update\(/);
  assert.match(tools, /readNoteVersions\.set\(noteId, note\.updatedAt\)/);
  assert.match(proposal, /kind: 'note', id: note\.id, updatedAt:/);
  assert.match(proposal, /if \(snapshot\.kind === 'note'\)/);
  assert.match(proposal, /aiPersonalNotesService\.update\(/);
  assert.match(proposal, /const notesBefore = noteIds\.length/);
  assert.match(proposal, /captureProposalAfter\(userId, before, createdIds, notesBefore\)/);
  assert.match(undo, /notes\?: \{ before: StoredNote\[\]; after:/);
  assert.match(undo, /tx\.standaloneNote\.updateMany/);
  assert.match(undo, /noteHistory\.before\.length/);
  assert.match(card, /Изменения заметки/);
  assert.match(card, /update_note: 'Изменение заметки'/);
  assert.match(card, /standalone-notes-updated/);
  assert.match(card, /api\.undoAiTaskProposal/);
  for (const component of [web, mini]) {
    assert.match(component, /<AiTaskProposalCard/);
  }
});

test('queued note edit rechecks the original read version before applying and cannot overwrite later edits', async () => {
  const { createAiPersonalNotesService } = await import('../src/services/ai-create-note.service.js');
  const version = new Date('2026-10-19T08:00:00.000Z');
  const newer = new Date('2026-10-19T08:01:00.000Z');
  let writes = 0;
  const db = {
    standaloneNote: {
      findFirst: async () => ({ id: 'note', userId: 'owner', title: 'Кавказская песня', content: '<p>Куплет</p>', groupId: null, updatedAt: newer }),
      updateMany: async () => { writes += 1; return { count: 1 }; }
    }
  };
  const service = createAiPersonalNotesService(db as unknown as Parameters<typeof createAiPersonalNotesService>[0]);
  const result = await service.update('owner', {
    id: 'note', title: null, content: 'Bm A Em D\\nКуплет',
    contentMode: 'replace', groupName: null
  }, version.toISOString());
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NOTE_CHANGED');
  assert.equal(writes, 0, 'Confirmation must not overwrite a newer version of the note');
});
