import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { makeAiReplyTarget, parseAiReply, serializeAiReply } from '../../client/src/components/AiMessageReply.js';

test('reply preserves quoted text, message ID and uploaded/generated file IDs', () => {
  const target = makeAiReplyTarget({
    id: 'original-123', role: 'assistant', content: 'Полный исходный ответ с контекстом',
    attachmentPreviews: [{ name: 'source.pdf' }],
    generatedDocument: { id: 'file-456', fileName: 'report.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 800 }
  });
  const formatted = serializeAiReply('Поясни второй пункт', target);
  assert.match(formatted, /original-123/);
  assert.match(formatted, /file-456/);
  assert.match(formatted, /source\.pdf/);
  assert.match(formatted, /Полный исходный ответ/);
  assert.deepEqual(parseAiReply(formatted)?.reply, target);
  assert.equal(parseAiReply(formatted)?.text, 'Поясни второй пункт');
  assert.equal(serializeAiReply('Самостоятельный вопрос', null), 'Самостоятельный вопрос');
  assert.equal(parseAiReply('Обычное сообщение'), null);
});

test('first chat reply may suggest a title but never overwrites a manual rename', async () => {
  const [service, app, mini, api] = await Promise.all([
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/api.ts', import.meta.url), 'utf8')
  ]);
  assert.match(service, /suggestAiChatTitle\(/);
  assert.match(service, /history\.length === 0/);
  assert.match(service, /!quick && history\.length === 0/);
  assert.match(service, /startsWith\('telegram-ai-assistant:'\)/);
  assert.match(api, /suggestedChatTitle\?: string/);
  for (const text of [app, mini]) {
    assert.match(text, /result\.suggestedChatTitle/);
    assert.match(text, /chat\.id !== chatId \|\| !\/\^\(Новый чат\|Чат/);
  }
});

test('reply controls and previews cover website focus, task chats, miniapp and mobile web', async () => {
  const [web, mini, expanded, css] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/ExpandedAiChat.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/TelegramMessageQuickShare.css', import.meta.url), 'utf8')
  ]);
  assert.ok((web.match(/<AiReplyAction/g) ?? []).length >= 6);
  assert.ok((mini.match(/<AiReplyAction/g) ?? []).length >= 2);
  assert.match(web, /serializeAiReply\(/);
  assert.match(mini, /serializeAiReply\(/);
  assert.match(expanded, /<AiReplyPreview/);
  assert.match(css, /\.ai-message-forward-actions \{ justify-content: space-between/);
});

test('focus task settings are opaque and use dark theme for labels, dropdowns and buttons', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);
  const part = app.slice(app.indexOf('{isFocusedSettingsOpen ? ('), app.indexOf('focused-task-subtasks mt-2', app.indexOf('{isFocusedSettingsOpen ? (')));
  assert.doesNotMatch(part, /rounded-3xl border bg-white/);
  assert.match(css, /body\[data-theme='dark'\] \.focused-task-settings-panel \{/);
  assert.match(css, /background: #101b2d !important/);
  assert.match(css, /\.focused-task-settings-panel \.focused-task-sector-option/);
});
