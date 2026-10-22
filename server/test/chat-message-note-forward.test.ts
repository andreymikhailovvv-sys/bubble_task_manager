import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { escapeNoteText } from '../../client/src/lib/notes.js';
import { buildQuickRewritePayload, validateQuickText, validateQuickInstruction } from '../src/services/telegram-quick-share-ai.service.js';

const clientFile = (path: string) => readFile(new URL('../../client/src/' + path, import.meta.url), 'utf8');
const serverFile = (path: string) => readFile(new URL('../src/' + path, import.meta.url), 'utf8');

test('reply and forward share the same thin glyph, with a second chevron only on forward', async () => {
  const icons = await clientFile('components/MessageActionIcons.tsx');
  const reply = await clientFile('components/AiMessageReply.tsx');
  const share = await clientFile('components/TelegramMessageQuickShare.tsx');
  assert.match(icons, /direction === 'reply' \? 'translate\(24 0\) scale\(-1 1\)'/);
  assert.match(icons, /direction === 'forward' \? <path/);
  assert.match(reply, /<MessageActionArrow direction="reply"/);
  assert.match(share, /<MessageActionArrow direction="forward"/);
  assert.match(share, /<TelegramPlaneIcon size=\{17\}/);
});

test('notes sharing uses standalone note records and escapes untrusted HTML', async () => {
  const share = await clientFile('components/TelegramMessageQuickShare.tsx');
  assert.match(share, /setDestination\('notes'\)/);
  assert.match(share, /setMode\('note'\)/);
  assert.match(share, /escapeNoteText\(value\)/);
  assert.match(share, /api\.createStandaloneNote\(\{ title: noteTitle\.trim\(\)/);
  assert.match(share, /standalone-notes-updated/);
  assert.match(share, /api\.rewriteTextForNote/);
  assert.match(share, /api\.telegramQuickRewrite/);
  assert.equal(escapeNoteText('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});

test('notes AI rewrite is authenticated and independent of Telegram sessions or recipients', async () => {
  const routes = await serverFile('routes/api.ts');
  const rewrite = await serverFile('services/telegram-quick-share-ai.service.ts');
  const api = await clientFile('lib/api.ts');
  assert.match(routes, /post\('\/notes\/quick-rewrite', requireAuth/);
  assert.match(routes, /notesRewriteLimiter\.consume\(req\.user!\.id\)/);
  assert.match(routes, /rewriteNotesQuickText\(req\.user!\.id, req\.body\?\.text, req\.body\?\.instruction\)/);
  assert.match(api, /rewriteTextForNote:/);
  assert.match(rewrite, /destination === 'telegram' && !isTelegramAiDraftEnabled\(\)/);
  assert.match(rewrite, /feature: destination === 'notes' \? 'notes_quick_rewrite'/);
  const payload = buildQuickRewritePayload('Сырой текст', 'Сократи', 'test-model', 'notes');
  assert.equal(payload.store, false);
  assert.equal(payload.tool_choice, 'none');
  assert.match(payload.input[0].content, /личные заметки пользователя/);
  assert.doesNotMatch(JSON.stringify(payload), /encryptedSession|recipientIds|connectedOwner/);
  assert.equal(validateQuickText('Текст'), 'Текст');
  assert.equal(validateQuickInstruction('  Сократи  '), 'Сократи');
  assert.throws(() => validateQuickText('A'.repeat(4001)));
});


test('curved arrow shaft ends at the chevron vertex, and the Telegram mark is centered', async () => {
  const icons = await clientFile('components/MessageActionIcons.tsx');
  // Both arrows enter a chevron corner at the same y coordinate.
  assert.match(icons, /9\.5 10H15/);
  assert.match(icons, /9\.5 10H19/);
  assert.match(icons, /M12 3 19 10 12 17/);
  assert.match(icons, /M8 3 15 10 8 17/);
  assert.match(icons, /transform="translate\(-0\.65 0\.65\)"/);
});

test('notes forwarding allows an explicit group and matches the source task sector', async () => {
  const share = await clientFile('components/TelegramMessageQuickShare.tsx');
  const web = await clientFile('App.tsx');
  const mini = await clientFile('MiniApp.tsx');
  assert.match(share, /initialNoteSphereId\?: string \| null/);
  assert.match(share, /api\.getStandaloneNoteGroups\(\)/);
  assert.match(share, /group\.sphereId === initialNoteSphereId/);
  assert.match(share, /setNoteGroupId\(taskGroup\?\.id \?\? ''\)/);
  assert.match(share, /aria-label="Группа заметки"/);
  assert.doesNotMatch(share, /<select value=\{noteGroupId\}/);
  assert.match(share, /className="standalone-group-picker-option/);
  assert.match(share, /Создать новую группу/);
  assert.match(share, /onClick=\{\(\) => \{ setNoteGroupId\(group\.id\); setGroupPickerPosition\(null\); \}\}/);
  assert.match(share, /groupId: noteGroupId \|\| null/);
  assert.match(share, /!noteGroupsReady \|\| noteGroupsLoading \|\| noteGroupsError/);
  // Regular task AI, focus AI and mobile task AI, but not general AI chat.
  assert.equal((web.match(/initialNoteSphereId=\{focusActiveTask\?\.sphereId \?\? null\}/g) ?? []).length, 2);
  assert.equal((web.match(/initialNoteSphereId=\{focusedTask\?\.sphereId \?\? null\}/g) ?? []).length, 2);
  assert.equal((mini.match(/initialNoteSphereId=\{openedTask\?\.sphereId \?\? null\}/g) ?? []).length, 1);
});


test('notes AI edit step has only rewrite and back actions; direct save remains on initial step', async () => {
  const share = await clientFile('components/TelegramMessageQuickShare.tsx');
  const edit = share.slice(share.indexOf("          ) : mode === 'edit' ? ("), share.indexOf("          ) : (\n            <>\n              <p className=\"telegram-quick-share__subtitle", share.indexOf("          ) : mode === 'edit' ? (")));
  const noteActions = edit.slice(edit.indexOf("              {destination === 'notes' ? ("), edit.indexOf("              ) : (", edit.indexOf("              {destination === 'notes' ? (")));
  assert.ok(noteActions.includes("Изменить через ИИ"));
  assert.ok(noteActions.includes("Назад"));
  assert.ok(noteActions.includes("setMode('note')"));
  assert.ok(!edit.includes('Сохранить без ИИ'));
  assert.ok(!noteActions.includes('saveNote('));
  const initialNotes = share.slice(share.indexOf("          {mode === 'note' ? ("), share.indexOf("          ) : mode === 'recipients' ? ("));
  assert.ok(initialNotes.includes('saveNote(baseText)'));
  assert.ok(edit.includes("destination === 'telegram' ? ("));
});


test('AI rewrite in notes and Telegram does not cap at 4000 and displays charged credits', async () => {
  const ui = await clientFile('components/TelegramMessageQuickShare.tsx');
  const api = await clientFile('lib/api.ts');
  const routes = await serverFile('routes/api.ts');
  const stats = await serverFile('services/ai-credit-statistics.service.ts');
  assert.ok(!ui.includes('baseText.length > 4000'));
  assert.ok(!ui.includes('ИИ может изменить до 4000'));
  assert.ok(ui.includes('rewriteCreditsSpentMilli'));
  assert.ok(ui.includes('Списано за ИИ-редактирование'));
  assert.ok(ui.includes('formatShareCredits(next.rewriteCreditsSpentMilli)'));
  assert.ok(api.includes('creditsSpentMilli: number'));
  assert.ok(routes.includes('res.json(rewritten)'));
  assert.ok(stats.includes("notes_quick_rewrite: 'Изменение текста для заметок'"));
  assert.ok(stats.includes("telegram_quick_rewrite: 'Изменение текста для Telegram'"));
});


test('group picker uses a portal and reusable group manager above the share dialog without closing draft', async () => {
  const share = await clientFile('components/TelegramMessageQuickShare.tsx');
  const manager = await clientFile('components/StandaloneNoteGroupManager.tsx');
  const css = await clientFile('components/TelegramMessageQuickShare.css');
  assert.match(share, /groupPickerPosition \? createPortal\(/);
  assert.match(share, /z-\[2147483646\]/);
  assert.match(share, /<StandaloneNoteGroupManager/);
  assert.match(manager, /z-\[2147483647\]/);
  assert.match(share, /startNew/);
  assert.match(share, /onCreated=\{\(created\) => \{/);
  assert.match(share, /setNoteGroupId\(created\.id\)/);
  assert.match(share, /setCreateGroupOpen\(false\)/);
  assert.match(share, /setNoteGroups\(current => \[\.\.\.current, created\]\)/);
  assert.match(share, /api\.createStandaloneNoteGroup\(data\)/);
  assert.match(share, /noteGroupStyle\(group\.color\)/);
  assert.match(share, /createGroupOpen\) return;/);
  assert.match(css, /telegram-quick-share__group-trigger/);
  assert.doesNotMatch(share, /<select value=\{noteGroupId\}/);
});
