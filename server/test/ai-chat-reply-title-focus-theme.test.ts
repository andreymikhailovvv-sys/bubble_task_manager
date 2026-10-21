import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { makeAiReplyTarget, parseAiReply, serializeAiReply } from '../../client/src/components/AiMessageReply.js';
import { CHAT_TITLE_INSTRUCTION, extractAiChatTitleFromAnswer, isDefaultAiChatTitle, normalizeAiChatTitle, shouldSuggestAiChatTitle } from '../src/services/ai-chat-title.service.js';

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
  assert.match(service, /shouldSuggestAiChatTitle\(/);
  assert.match(service, /extractAiChatTitleFromAnswer\(result\.answer\)/);
  assert.match(service, /messages\.splice\(1, 0, \{ role: 'system', content: CHAT_TITLE_INSTRUCTION \}\)/);
  assert.match(service, /model: input\.model/);
  assert.doesNotMatch(service, /model: 'gpt-5\.4-mini',\s*max_output_tokens: 128/);
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
  assert.match(css, /\.ai-message-forward-actions \{\s*justify-content: flex-end;\s*gap: 7px;/);
});

test('title recognition covers Чат 1 and manual titles without false matches', () => {
  for (const title of ['Новый чат', ' Чат 1 ', 'Чат 27', 'ЧАТ 120']) {
    assert.equal(isDefaultAiChatTitle(title), true, title);
    assert.equal(shouldSuggestAiChatTitle({ chatId: 'personal-chat', chatTitle: title, historyLength: 0, quick: false }), true);
  }
  for (const title of ['План на отпуск', 'Чат 1 работа', 'Мои заметки', 'Чат \d+']) {
    assert.equal(isDefaultAiChatTitle(title), false, title);
  }
  assert.equal(shouldSuggestAiChatTitle({ chatId: 'personal-chat', chatTitle: 'Чат 2', historyLength: 1, quick: false }), false);
  assert.equal(shouldSuggestAiChatTitle({ chatId: 'quick-ai-requests', chatTitle: 'Новый чат', historyLength: 0, quick: true }), false);
  assert.equal(shouldSuggestAiChatTitle({ chatId: 'telegram-ai-assistant:123', chatTitle: 'Новый чат', historyLength: 0, quick: false }), false);
  assert.equal(shouldSuggestAiChatTitle({ chatTitle: 'Новый чат', historyLength: 0, quick: false }), false);
});

test('the selected model returns a title with the answer, and it is hidden from user text', () => {
  const sample = 'Пользуйтесь поиском по проектам.\n\n[[PLANIROVYCH_CHAT_TITLE:Поиск по проектам]]';
  assert.match(CHAT_TITLE_INSTRUCTION, /ПЕРВОГО ответа/);
  assert.deepEqual(extractAiChatTitleFromAnswer(sample), {
    answer: 'Пользуйтесь поиском по проектам.', title: 'Поиск по проектам'
  });
  assert.equal(extractAiChatTitleFromAnswer('Только ответ').title, null);
  assert.equal(normalizeAiChatTitle('«Изменения календаря»'), 'Изменения календаря');
  assert.equal(normalizeAiChatTitle('Чат 17'), null);
});

test('title generation preserves selected model and icon grouping is shared by web and miniapp', async () => {
  const [service, app, mini, css, share] = await Promise.all([
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/TelegramMessageQuickShare.css', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/TelegramMessageQuickShare.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(service, /suggestAiChatTitle\(\{ apiKey, model, question/);
  assert.match(service, /max_output_tokens: 512/);
  assert.doesNotMatch(service, /model: 'gpt-5\.4-mini',\s*max_output_tokens/);
  for (const source of [app, mini]) {
    assert.match(source, /<AiReplyAction[^>]*\/><TelegramMessageQuickShare/);
    assert.match(source, /Чат \\d\+/);
    assert.doesNotMatch(source, /Чат \\\\d\+/);
  }
  assert.match(share, /<Send size=\{18\}/);
  assert.doesNotMatch(share, /<Forward size=/);
  assert.match(css, /justify-content: flex-end;\s*gap: 7px/);
  assert.doesNotMatch(css, /justify-content: space-between/);
});

test('reply and share use equally sized optical glyphs across web, Mini App and mobile', async () => {
  const [reply, forward, styles] = await Promise.all([
    readFile(new URL('../../client/src/components/AiMessageReply.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/TelegramMessageQuickShare.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/TelegramMessageQuickShare.css', import.meta.url), 'utf8')
  ]);
  assert.match(reply, /<svg width=\{18\} height=\{18\} viewBox="0 0 24 24"/);
  assert.match(reply, /<path d="m11 2-9 10 9 10"/);
  assert.match(reply, /<path d="M2 12h9c7 0 11 3 11 10"/);
  assert.match(forward, /<Send size=\{18\} strokeWidth=\{1\.5\}/);
  assert.match(styles, /\.ai-message-forward-actions \{\s*justify-content: flex-end;\s*gap: 7px;/);
  assert.match(styles, /button\.telegram-quick-share__trigger svg,\s*body\[data-theme\] \.ai-message-forward-actions button\.ai-message-reply-trigger svg/);
  assert.match(styles, /width: 18px !important;\s*height: 18px !important;/);
  assert.match(styles, /button\.ai-message-reply-trigger svg \{\s*transform: translateX\(2px\) !important;/);
  assert.match(styles, /\.miniapp-shell \.ai-message-forward-actions button\.ai-message-reply-trigger svg/);
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
