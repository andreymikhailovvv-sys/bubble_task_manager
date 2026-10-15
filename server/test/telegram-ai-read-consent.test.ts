import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TELEGRAM_AI_READ_COUNTS, TELEGRAM_REQUEST_READ_TOOL, validateTelegramAiReadCount } from '../src/services/telegram-ai-read-consent.service.js';
import { telegramSendTargetFromDialog } from '../src/services/telegram-send-targets.service.js';
import { Api } from 'teleproto';

test('exactly five selectable message counts; missing/oversized read is forbidden', () => {
  assert.deepEqual(TELEGRAM_AI_READ_COUNTS, [10, 20, 30, 50, 100]);
  for (const n of TELEGRAM_AI_READ_COUNTS) assert.equal(validateTelegramAiReadCount(n), n);
  for (const n of [0, 1, 11, 40, 101, 1000, '100', null, 10.5]) assert.throws(() => validateTelegramAiReadCount(n));
});
test('AI can only request a named chat; tool schema contains no content or Telegram token', () => {
  assert.equal(TELEGRAM_REQUEST_READ_TOOL.name, 'request_telegram_chat_read');
  assert.equal(TELEGRAM_REQUEST_READ_TOOL.strict, true);
  assert.deepEqual(TELEGRAM_REQUEST_READ_TOOL.parameters.required, ['chat']);
  assert.deepEqual(Object.keys(TELEGRAM_REQUEST_READ_TOOL.parameters.properties), ['chat']);
  assert.equal(JSON.stringify(TELEGRAM_REQUEST_READ_TOOL).includes('sendMessage('), false);
});
test('group and supergroup peers resolve as selectable dialogs, broadcast channels excluded', () => {
  const group = new Api.Chat({ id: BigInt(245), title: 'Рабочая группа', participantsCount: 3 });
  const supergroup = new Api.Channel({ id: BigInt(543), title: 'Проект', megagroup: true, broadcast: false });
  const broadcast = new Api.Channel({ id: BigInt(897), title: 'Рассылка', broadcast: true, megagroup: false });
  assert.equal(telegramSendTargetFromDialog({ entity: group }, '1')?.id, 'group:chat:245');
  assert.equal(telegramSendTargetFromDialog({ entity: supergroup }, '1')?.id, 'group:supergroup:543');
  assert.equal(telegramSendTargetFromDialog({ entity: broadcast }, '1'), null);
});
test('consent route is owner scoped, one-use, no plaintext saved; task answer stays private', () => {
  const code = readFileSync(new URL('../src/services/telegram-ai-read-consent.service.ts', import.meta.url), 'utf8');
  assert.match(code, /state: 'PENDING'/);
  assert.match(code, /state: 'CONSUMED'/);
  assert.match(code, /createdAt: \{ gte:/);
  assert.match(code, /await telegramUserClientRead\.aiHistory/);
  assert.doesNotMatch(code, /encryptedPayload|appendTaskDialogMessages/);
  const task = readFileSync(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  assert.match(task, /telegramReadOwnerId: input\.userId/);
  const controller = readFileSync(new URL('../src/controllers/ai.controller.ts', import.meta.url), 'utf8');
  assert.match(controller, /consumeTelegramAiReadRequest/);
  assert.match(controller, /telegramChatRequestIsSameOrigin/);
});
