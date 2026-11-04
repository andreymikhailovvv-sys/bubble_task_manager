import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const src = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('focus editor names actions, reveals completed rows at bottom, and saves height per account', async () => {
  const [app, resize, css] = await Promise.all([
    src('../../client/src/App.tsx'),
    src('../../client/src/components/ResizableDescriptionSurface.tsx'),
    src('../../client/src/styles.css')
  ]);
  const start = app.indexOf('<aside className="focused-task-editor-shell');
  const end = app.indexOf('</aside>', start);
  const focus = app.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(focus, /<Edit3 size=\{15\} aria-hidden="true" \/>\s*<span>Редактировать описание<\/span>/);
  assert.match(focus, /focused-task-add-subtask-button focused-task-label-button[\s\S]*?<Plus size=\{15\} aria-hidden="true" \/>\s*<span>Добавить<\/span>/);
  assert.doesNotMatch(focus.slice(0,focus.indexOf('<Reorder.Group')), /Показывать закрытые подзадачи|Скрывать закрытые подзадачи/);
  const listEnd = focus.indexOf("focused-task-show-completed-row");
  assert.ok(listEnd > focus.indexOf('<Reorder.Group'));
  assert.match(focus.slice(listEnd), /Показать выполненные/);
  assert.match(focus, /getFocusedSubtaskItems\(focusedTask\.id\)\.filter\(\(task\) => task\.status === 'DONE'\)\.length/);
  assert.match(focus, /storageKey=\{currentUser\?\.id \? `planirovych:focus-description-height:v1:/);
  assert.match(resize, /window\.localStorage\.getItem\(storageKey\)/);
  assert.match(resize, /window\.localStorage\.setItem\(storageKey, String\(next\)\)/);
  assert.match(resize, /onPointerMove=\{moveResize\}/);
  assert.match(resize, /onKeyDown=\{\(event\) =>/);
  assert.match(css, /focused-task-show-completed-button/);
});

test('managed assistant chat can only prepare a reply card with bound recipient', async () => {
  const [tools, assistant, auto, telegramFeed, mailFeed, web, mini] = await Promise.all([
    src('../src/services/ai-chat-tools.service.ts'),
    src('../src/services/ai-assistant.service.ts'),
    src('../src/services/telegram-ai-auto-reply.service.ts'),
    src('../src/services/telegram-ai-inbox.service.ts'),
    src('../src/services/mail-assistant-inbox.service.ts'),
    src('../../client/src/App.tsx'),
    src('../../client/src/MiniApp.tsx')
  ]);
  assert.match(tools, /name: 'prepare_assistant_reply'/);
  assert.match(tools, /input\.assistantReplyContext \? \[PREPARE_ASSISTANT_REPLY_TOOL\] : \[\]/);
  assert.match(tools, /where: \{ id: context\.policyId, userId: input\.userId, isEnabled: true \}/);
  assert.match(tools, /recipientId: policy\.chatId/);
  assert.match(tools, /mailboxId: context\.mailboxId/);
  assert.match(tools, /folder: 'INBOX', status: 'DONE'/);
  assert.match(tools, /prepareOwnerMailSend\(input\.userId/);
  assert.doesNotMatch(tools.slice(tools.indexOf("if (name === 'prepare_assistant_reply')"),tools.indexOf("if (name === 'search_mailbox')")), /sendMessage\(|smtpReply\(/);
  assert.match(assistant, /assistantReplyContext, autoApplyTaskActions/);
  assert.match(assistant, /assistantMailbox\.email/);
  assert.match(assistant, /sourceMessageId: item\.id/);
  assert.match(auto, /telegram-ai-auto-reply:/);
  assert.ok(auto.indexOf('telegramAiInboxEvent.upsert') < auto.indexOf('await client.sendMessage(row.inputEntity'));
  assert.match(auto, /suggestedReplyStatus: 'SENT'/);
  assert.match(telegramFeed, /automated: event\.id\.startsWith\('telegram-ai-auto-reply:'\)/);
  assert.match(mailFeed, /mailSuggestedReply: row\.suggestedReplyText/);
  assert.match(web, /<MailAiReplySuggestionCard reply=\{item\.message\.mailSuggestedReply\}/);
  const occurrences = [...mini.matchAll(/<MailAiReplySuggestionCard reply=\{message\.mailSuggestedReply\}/g)];
  assert.ok(occurrences.length >= 2, 'both Mini App chat contexts render the mail card');
});
