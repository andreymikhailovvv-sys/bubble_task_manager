import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTelegramAnalysisSnapshot,
  telegramAnalysisContextText,
  type TelegramSafeHistoryMessage
} from '../src/lib/telegram-user-client-analysis-snapshot.js';
import {
  validateTelegramContextConsent,
  buildTelegramDialogAiPayload,
  parseTelegramDialogAiResult
} from '../src/services/telegram-user-client-dialog-assistant.service.js';

const createMessage = (id: number, text: string, out = false): TelegramSafeHistoryMessage =>
  ({ id, text, out, date: 1792050000 + id, senderName: 'Приватное имя', truncated: false, hasMedia: false });

test('only last 15 messages are included and the exact 1200-char scope is visible', () => {
  const history = Array.from({ length: 20 }, (_, index) => createMessage(index + 1, 'test'));
  history[19].text = 'Л'.repeat(1600);
  const snapshot = buildTelegramAnalysisSnapshot('12345', history);
  assert.equal(snapshot.messageCount, 15);
  assert.deepEqual(snapshot.messages.map((m) => m.id), Array.from({ length: 15 }, (_, i) => i + 6));
  assert.equal(snapshot.messages[14].text.length, 1200);
  assert.equal(snapshot.messages[14].truncated, true);
  const rendered = telegramAnalysisContextText(snapshot);
  assert.ok(!rendered.includes('Приватное имя'));
  assert.ok(rendered.includes('Собеседник'));
  assert.ok(!rendered.includes('12345'));
  assert.ok(!rendered.includes('Л'.repeat(1600)));
  assert.equal(snapshot.fingerprint.length, 64);
});

test('fingerprint binds to dialog and exact message content, timestamp, direction and scope', () => {
  const rows = [createMessage(1, 'Привет!'), createMessage(2, 'Отвечу завтра', true)];
  const baseline = buildTelegramAnalysisSnapshot('100', rows);
  assert.equal(buildTelegramAnalysisSnapshot('100', rows).fingerprint, baseline.fingerprint);
  assert.notEqual(buildTelegramAnalysisSnapshot('200', rows).fingerprint, baseline.fingerprint);
  assert.notEqual(buildTelegramAnalysisSnapshot('100', [rows[0], { ...rows[1], text: 'Отвечу сегодня' }]).fingerprint, baseline.fingerprint);
  assert.notEqual(buildTelegramAnalysisSnapshot('100', [rows[0], { ...rows[1], out: false }]).fingerprint, baseline.fingerprint);
  assert.notEqual(buildTelegramAnalysisSnapshot('100', [rows[0], { ...rows[1], date: rows[1].date + 1 }]).fingerprint, baseline.fingerprint);
});

test('AI dialog consent is explicit, scoped and input bounded', () => {
  const snapshot = buildTelegramAnalysisSnapshot('123', [createMessage(1, 'Test')]);
  const payload = { consent: true, fingerprint: snapshot.fingerprint, dialogId: '123', instruction: '', tone: 'friendly' };
  assert.deepEqual(validateTelegramContextConsent(payload), { dialogId: '123', fingerprint: snapshot.fingerprint, instruction: '', tone: 'friendly' });
  assert.throws(() => validateTelegramContextConsent({ ...payload, consent: false }), /отдельное подтверждение/);
  assert.throws(() => validateTelegramContextConsent({ ...payload, consent: 'true' }), /отдельное подтверждение/);
  assert.throws(() => validateTelegramContextConsent({ ...payload, fingerprint: 'abc' }), /Некорректное подтверждение/);
  assert.throws(() => validateTelegramContextConsent({ ...payload, dialogId: '@username' }), /Выберите личный диалог/);
  assert.throws(() => validateTelegramContextConsent({ ...payload, instruction: 'a'.repeat(601) }), /600/);
  assert.throws(() => validateTelegramContextConsent({ ...payload, tone: 'danger' }), /Некорректный стиль/);
});

test('provider receives read-only bounded transcript, no session, recipient ID or tools', () => {
  const messages = [createMessage(1, 'Когда встреча?'), createMessage(2, 'После обеда', true)];
  const context = buildTelegramAnalysisSnapshot('888', messages);
  const result = buildTelegramDialogAiPayload(context, 'Уточни время', 'formal', 'gpt-test');
  assert.equal(result.model, 'gpt-test');
  assert.equal(result.store, false);
  assert.equal(result.tool_choice, 'none');
  assert.equal(result.text.format.type, 'json_schema');
  assert.equal(result.input.length, 2);
  const request = JSON.stringify(result);
  assert.ok(request.includes('Уточни время'));
  assert.ok(request.includes('Когда встреча?'));
  assert.ok(!request.includes('Приватное имя'));
  assert.ok(!request.includes('encryptedSession'));
  assert.ok(!request.includes('telegramAccountId'));
  assert.ok(!request.includes('sendMessage('));
  assert.ok(!request.includes('888'));
  assert.ok(request.includes('НЕдоверенными'));
});

test('parses structured summary and editable single reply; rejects malformed or oversized responses', () => {
  const data = { summary: 'Договорились о встрече', reply: 'Уточни, пожалуйста, время.' };
  assert.deepEqual(parseTelegramDialogAiResult({ output_text: JSON.stringify(data) }), data);
  assert.deepEqual(parseTelegramDialogAiResult({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(data) }] }] }), data);
  assert.throws(() => parseTelegramDialogAiResult({ output_text: 'not json' }), /некорректный анализ/);
  assert.throws(() => parseTelegramDialogAiResult({ output_text: JSON.stringify({ summary: '', reply: 'Есть' }) }), /некорректное резюме/);
  assert.throws(() => parseTelegramDialogAiResult({ output_text: JSON.stringify({ summary: 'A'.repeat(1601), reply: 'Есть' }) }), /некорректное резюме/);
  assert.throws(() => parseTelegramDialogAiResult({ output_text: JSON.stringify({ summary: 'Ок', reply: '🚀'.repeat(1000) }) }), /слишком длинный/);
  assert.throws(() => parseTelegramDialogAiResult({ output_text: JSON.stringify({ summary: 'Ок', reply: '' }) }), /слишком длинный/);
});
