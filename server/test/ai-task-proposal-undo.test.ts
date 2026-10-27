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
  assert.match(ai, /autoApply: autonomousMonitoring \|\| input\.autoApplyTaskActions === true \? true : undefined/);
  assert.match(ai, /source: input\.autoApplyTaskActions && !autonomousMonitoring \? 'telegram_bot_task' : 'task_chat'/);
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
  assert.match(proposal, /captureProposalAfter\(userId, before, createdIds, notesBefore, createdNoteIds\)/);
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

test('create_note uses existing approval chip, not an immediate DB write, with a requested group', () => {
  const tools = source('../src/services/ai-chat-tools.service.ts');
  const proposal = source('../src/services/ai-task-proposal.service.ts');
  const undo = source('../src/services/ai-task-proposal-undo.service.ts');
  const card = source('../../client/src/components/AiTaskProposalCard.tsx');
  const assistant = source('../src/services/ai-assistant.service.ts');
  const createBlock = tools.slice(tools.indexOf("if (name === 'create_note')"), tools.indexOf("if (name === 'update_note')"));
  assert.match(createBlock, /validateAiCreateNoteArgs\(value\)/);
  assert.match(createBlock, /preparedTaskActions\.push\(\{ operation: 'create_note', \.\.\.note \}\)/);
  assert.doesNotMatch(createBlock, /aiPersonalNotesService\.create\(/);
  assert.match(tools, /preparedTaskActions\.length\s*\? await prepareTaskProposal/);
  assert.match(proposal, /function isCreateNoteAction/);
  assert.match(proposal, /where: \{ userId, name: \{ equals: payload\.groupName, mode: 'insensitive' \} \}/);
  assert.match(proposal, /aiPersonalNotesService\.create\(userId, action\)/);
  assert.match(proposal, /createdNoteIds\.push\(result\.note\.id\)/);
  assert.match(proposal, /createdNoteIds\);/);
  assert.match(undo, /createdNoteIds: string\[\] = \[\]/);
  assert.match(undo, /tx\.standaloneNote\.deleteMany/);
  assert.match(undo, /updatedAt: new Date\(note\.updatedAt\)/);
  assert.match(card, /create_note: 'Создание заметки'/);
  assert.match(card, /\['update_note', 'create_note'\]\.includes/);
  assert.match(card, /standalone-notes-updated/);
  assert.match(assistant, /groupName/);
});

test('creating notes assigns only an existing owner-scoped group', async () => {
  const { createAiPersonalNotesService } = await import('../src/services/ai-create-note.service.js');
  const writes: Array<Record<string, unknown>> = [];
  const db = {
    standaloneNoteGroup: {
      findFirst: async ({ where }: { where: { userId: string; name: { equals: string } } }) =>
        where.userId === 'owner' && where.name.equals === 'Музыка' ? { id: 'group-owner', name: 'Музыка' } : null
    },
    standaloneNote: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data);
        return { id: 'note-created', title: data.title, groupId: data.groupId, createdAt: new Date() };
      }
    }
  };
  const service = createAiPersonalNotesService(db as unknown as Parameters<typeof createAiPersonalNotesService>[0]);
  const groupNote = await service.create('owner', { title: 'Песня', content: 'Bm A Em D', groupName: 'Музыка' });
  assert.equal(groupNote.ok, true);
  assert.equal(writes[0].groupId, 'group-owner');
  const foreign = await service.create('someone-else', { title: 'Песня', content: 'Новый текст', groupName: 'Музыка' });
  assert.equal(foreign.ok, false);
  assert.equal(writes.length, 1);
  const ungrouped = await service.create('owner', { title: 'Текст', content: 'Строка', groupName: null });
  assert.equal(ungrouped.ok, true);
  assert.equal(writes[1].groupId, null);
});

test('all AI chat attachment queues clear on send and replies re-enable scrolling', () => {
  const web = source('../../client/src/App.tsx');
  const mini = source('../../client/src/MiniApp.tsx');
  const expanded = source('../../client/src/components/ExpandedAiChat.tsx');
  const css = source('../../client/src/styles.css');
  assert.match(web, /setAiChatPendingFiles\(\[\]\);[\s\S]*?const result = await api\.askAiChatStreaming/);
  assert.match(mini, /setAiChatPendingFiles\(\[\]\);[^\n]*\n\s*const result = await api\.askAiChatStreaming/);
  assert.match(web, /setFocusAiPendingFiles\(\[\]\);/);
  assert.match(web, /setAiPendingFiles\(\[\]\);/);
  assert.match(mini, /setAiPendingFiles\(\[\]\);/);
  assert.match(web, /if \(quick\) quickAiFollowBottomRef\.current = true;/);
  assert.match(expanded, /previousLoadingRef\.current && !loading/);
  assert.match(mini, /generalAiChatNearBottomRef\.current = true;\s*if \(result\.actionReports/);
  assert.match(css, /\.ai-system-notification-spacing \{ margin-bottom: 27px; \}/);
  assert.match(web, /system-notification-message ai-system-notification-spacing/);
  assert.match(css, /\.ai-attachment-tiles-history \.ai-attachment-tile-file-icon/);
});
