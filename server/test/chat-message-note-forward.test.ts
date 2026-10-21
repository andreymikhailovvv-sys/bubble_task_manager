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
