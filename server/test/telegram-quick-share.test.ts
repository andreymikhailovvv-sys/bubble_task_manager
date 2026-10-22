import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { encryptTelegramQuickShare, decryptTelegramQuickShare } from '../src/lib/telegram-quick-share-crypto.js';
import { TELEGRAM_SAVED_MESSAGES_ID, validateQuickRecipients, validateQuickSendInput } from '../src/services/telegram-quick-share.service.js';
import { buildQuickRewritePayload, parseQuickRewriteOutput, getQuickRewriteResponseDiagnostics, validateQuickText, validateShareText, validateQuickInstruction, splitQuickText, MAX_QUICK_TEXT } from '../src/services/telegram-quick-share-ai.service.js';

test('quick send allows 1 to 3 people or groups, not raw channel/group peer IDs', () => {
  assert.deepEqual(validateQuickRecipients(['123', '987', '42']), ['123', '987', '42']);
  for(const value of [[], ['123','123'], ['1','2','3','4'], ['-100222'], ['123','@username'], '123', ['0'], [123]]) {
    assert.throws(() => validateQuickRecipients(value));
  }
});
test('Saved Messages is an explicit single virtual target allowed in up to 3 quick-share recipients', () => {
  assert.equal(TELEGRAM_SAVED_MESSAGES_ID, 'saved');
  assert.deepEqual(validateQuickRecipients(['saved']), ['saved']);
  assert.deepEqual(validateQuickRecipients(['saved', '123', '456']), ['saved', '123', '456']);
  assert.throws(() => validateQuickRecipients(['saved', 'saved']), /разных людей или беседы/);
  assert.throws(() => validateQuickRecipients(['saved', '1', '2', '3']), /трёх получателей/);
  assert.throws(() => validateQuickRecipients(['Saved']), /разных людей или беседы/);
  assert.throws(() => validateQuickRecipients(['-10055']), /разных людей или беседы/);
  const requestId = randomUUID();
  const request = validateQuickSendInput({
    requestId, recipientIds: ['saved'], text: 'Тестовое сообщение в Избранное', mode: 'DIRECT'
  });
  assert.equal(request.recipientIds[0], 'saved');
});

test('direct send requires a unique request id, bounded text, strictly selected recipients', () => {
  const requestId = randomUUID();
  const valid = validateQuickSendInput({ requestId, recipientIds: ['123'], text: 'Привет', mode: 'DIRECT' });
  assert.equal(valid.requestId, requestId);
  assert.equal(valid.instruction, null);
  assert.equal(valid.mode, 'DIRECT');
  assert.throws(() => validateQuickSendInput({ requestId: 'anything', recipientIds: ['123'], text: 'Привет', mode: 'DIRECT' }));
  assert.throws(() => validateQuickSendInput({ requestId, recipientIds: ['123'], text: '', mode: 'DIRECT' }));
  assert.throws(() => validateQuickSendInput({ requestId, recipientIds: ['123'], text: 'text', mode: 'UNKNOWN' }));
  assert.throws(() => validateQuickText('X'.repeat(4001)));
  assert.equal(validateShareText('X'.repeat(4001)).length, 4001);
  assert.throws(() => validateShareText('X'.repeat(MAX_QUICK_TEXT + 1)));
  assert.throws(() => validateQuickText('a\u0000b'));
});
test('auto-rewrite mode cannot enqueue without explicit editing instructions', () => {
  const requestId = randomUUID();
  assert.throws(() => validateQuickSendInput({ requestId, recipientIds: ['123'], text: 'Source', mode: 'REWRITE_AND_SEND' }));
  const value = validateQuickSendInput({ requestId, recipientIds: ['123'], text: 'Source', instruction: '  Сделай короче  ', mode: 'REWRITE_AND_SEND' });
  assert.equal(value.instruction, 'Сделай короче');
  assert.throws(() => validateQuickInstruction('x'.repeat(701)));
  assert.throws(() => validateQuickInstruction('\u0000'));
});
test('background payload is encrypted and authenticated to both owner and job ID with existing key', () => {
  const key = 'a'.repeat(64);
  const jobId = randomUUID();
  const text = 'Засекреченное сообщение: личный номер 777';
  const previous = process.env.TELEGRAM_USER_SESSION_KEY;
  process.env.TELEGRAM_USER_SESSION_KEY = key;
  try {
    const ciphertext = encryptTelegramQuickShare(text, 'user-test-id-1234', jobId);
    assert.ok(!ciphertext.includes(text));
    assert.equal(decryptTelegramQuickShare(ciphertext, 'user-test-id-1234', jobId), text);
    assert.throws(() => decryptTelegramQuickShare(ciphertext, 'someone-else-1234', jobId));
    assert.throws(() => decryptTelegramQuickShare(ciphertext, 'user-test-id-1234', randomUUID()));
    assert.throws(() => decryptTelegramQuickShare(ciphertext.slice(0,-3)+'xyz', 'user-test-id-1234', jobId));
  } finally {
    if (previous === undefined) delete process.env.TELEGRAM_USER_SESSION_KEY;
    else process.env.TELEGRAM_USER_SESSION_KEY = previous;
  }
});
test('AI rewrite is text-only, excludes Telegram sessions, peers and all callable tools', () => {
  const payload = buildQuickRewritePayload('Первоначальный текст', 'Сделай короче', 'test-model');
  assert.equal(payload.model, 'test-model');
  assert.equal(payload.store, false);
  assert.equal(payload.tool_choice, 'none');
  const serial = JSON.stringify(payload);
  assert.ok(serial.includes('Первоначальный текст'));
  assert.ok(serial.includes('Сделай короче'));
  assert.ok(!serial.includes('encryptedSession'));
  assert.ok(!serial.includes('recipientIds'));
  assert.ok(!serial.includes('sendMessage'));
  assert.equal(parseQuickRewriteOutput({ output_text: 'Переработанный текст' }), 'Переработанный текст');
  assert.equal(parseQuickRewriteOutput({ output_text: 'a'.repeat(4001) }).length, 4001);
  assert.throws(() => parseQuickRewriteOutput({ output_text: 'a'.repeat(MAX_QUICK_TEXT + 1) }));
});


test('long Telegram text is split losslessly and safely across Unicode code points', () => {
  const input = 'Привет 🌍!\n'.repeat(1900);
  const chunks = splitQuickText(input);
  assert.ok(chunks.length > 2);
  assert.equal(chunks.join(''), input);
  assert.ok(chunks.every(chunk => chunk.length <= 4000));
  assert.ok(chunks.every(chunk => Buffer.byteLength(chunk, 'utf8') <= 35000));
  assert.deepEqual(splitQuickText('Короткое сообщение'), ['Короткое сообщение']);
  const emoji = splitQuickText('😀'.repeat(4500));
  assert.equal(emoji.join(''), '😀'.repeat(4500));
  assert.ok(emoji.every(part => part.length <= 4000));
});

test('long quick rewrite uses token-billed wallet preflight, settlement and billing receipt', async () => {
  const { readFile } = await import('node:fs/promises');
  const ai = await readFile(new URL('../src/services/telegram-quick-share-ai.service.ts', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../src/services/telegram-quick-share.service.ts', import.meta.url), 'utf8');
  const billing = await readFile(new URL('../src/services/dynamic-responses-billing.service.ts', import.meta.url), 'utf8');
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  assert.match(ai, /runDynamicResponsesCall\(/);
  assert.match(ai, /settleDynamicResponsesCall\(/);
  assert.match(ai, /refundDynamicResponsesCall\(/);
  assert.match(ai, /creditsSpentMilli/);
  assert.match(billing, /notes_quick_rewrite: \{ min:/);
  assert.match(billing, /telegram_quick_rewrite: \{ min:/);
  assert.match(worker, /rewriteCreditsSpentMilli: revised\.creditsSpentMilli/);
  assert.match(worker, /fragments\[partIndex\]/);
  assert.match(worker, /partIndex \? ':' \+ partIndex : ''/);
  assert.match(schema, /rewriteCreditsSpentMilli\s+Int\s+@default\(0\)/);
  const payload = buildQuickRewritePayload('Начало текста', 'Улучши стиль', 'test-model', 'notes');
  assert.ok(!JSON.stringify(payload).includes('Максимум 4000 символов'));
});

test('quick notes rewrite limits reasoning and extracts text from actual Responses message content', () => {
  const payload = buildQuickRewritePayload('Подробный текст', 'Сделай короче', 'gpt-6-luna', 'notes');
  assert.deepEqual(payload.reasoning, { effort: 'low' });
  assert.equal(payload.store, false);
  const response = {
    status: 'completed',
    output: [
      { type: 'reasoning', summary: [] },
      { type: 'message', content: [{ type: 'output_text', text: 'Краткий текст' }] }
    ]
  };
  assert.equal(parseQuickRewriteOutput(response), 'Краткий текст');
});

test('quick notes rewrite never saves an incomplete response, even if it contains partial text', () => {
  assert.throws(
    () => parseQuickRewriteOutput({
      status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Только начало' }] }]
    }),
    /не завершил изменение текста/
  );
  assert.throws(
    () => parseQuickRewriteOutput({
      status: 'completed',
      output: [{ type: 'reasoning', summary: [] }],
      usage: { output_tokens: 297, output_tokens_details: { reasoning_tokens: 291 } }
    }),
    /не вернул пригодный текст/
  );
});

test('failed notes rewrite diagnostics report output/reasoning counts but never any user text', () => {
  const diagnostic = getQuickRewriteResponseDiagnostics({
    status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
    output: [
      { type: 'reasoning', content: 'Личный текст заметки' },
      { type: 'message', content: [{ type: 'output_text', text: 'Личный текст заметки' }] }
    ],
    usage: { output_tokens: 297, output_tokens_details: { reasoning_tokens: 291 } }
  });
  assert.deepEqual(diagnostic, {
    responseStatus: 'incomplete', incompleteReason: 'max_output_tokens',
    outputTokens: 297, reasoningTokens: 291, outputTypes: ['reasoning', 'message']
  });
  assert.ok(!JSON.stringify(diagnostic).includes('Личный текст заметки'));
});

test('notes rewrite has at most two attempts per fragment and refunds invalid responses before retry', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/services/telegram-quick-share-ai.service.ts', import.meta.url), 'utf8');
  assert.match(source, /const MAX_REWRITE_ATTEMPTS_PER_FRAGMENT = 2/);
  assert.match(source, /const REWRITE_RECOVERY_MODEL = 'gpt-5\.4-mini'/);
  assert.match(source, /index \* MAX_REWRITE_ATTEMPTS_PER_FRAGMENT \+ attempt/);
  assert.match(source, /await refundDynamicResponsesCall\(call\)/);
  assert.match(source, /if \(attempt === MAX_REWRITE_ATTEMPTS_PER_FRAGMENT\)/);
  assert.match(source, /calls\.push\(call\); \/\/ Only validated fragments/);
  assert.match(source, /getQuickRewriteResponseDiagnostics\(call\.responseJson\)/);
});
