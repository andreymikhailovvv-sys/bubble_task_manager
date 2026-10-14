import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isGeneratedImageEditRequest } from '../src/services/ai-image-edit-intent.js';
import { runAiChatToolLoop } from '../src/services/ai-chat-tools.service.js';

test('image editing requires an explicit image reference, not an ambiguous follow-up', () => {
  for (const prompt of [
    'Измени картинку: добавь Луну',
    'Переделай изображение, сделай фон светлее',
    'Добавь текст на картинку',
    'Убери звёзды с изображения',
    'Edit the image and replace the sky'
  ]) assert.equal(isGeneratedImageEditRequest(prompt), true, prompt);
  for (const prompt of [
    'Исправь её, пусть будет реалистично',
    'А теперь сделай фон тёмным',
    'Измени его',
    'Поменяй цвет',
    'Отредактируй файл',
    'Прочитай третий абзац документа и перепиши его',
    'Нарисуй новую картинку',
    'Измени дедлайн задачи',
    'Добавь задачу на завтра',
    'Сделай Excel таблицу',
    'Сколько у меня кредитов?'
  ]) assert.equal(isGeneratedImageEditRequest(prompt), false, prompt);
});

test('a single empty model response retries with context and produces an answer', async () => {
  const inputs: unknown[][] = [];
  const result = await runAiChatToolLoop({
    initialInput: [{ role: 'user', content: 'Привет' }],
    request: async (input) => {
      inputs.push([...input]);
      return inputs.length === 1
        ? { status: 'completed', output: [{ type: 'reasoning' }], usage: { input_tokens: 10, output_tokens: 4 } }
        : { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Ответ готов' }] }] };
    },
    executeTool: async () => { throw new Error('Unexpected tool'); }
  });
  assert.equal(result.answer, 'Ответ готов');
  assert.equal(result.providerCalls, 2);
  assert.equal(inputs.length, 2);
  assert.ok(inputs[1].some((part) => typeof part === 'object' && part !== null && 'role' in part && part.role === 'system'));
});

test('two empty model responses fail safely instead of retrying indefinitely', async () => {
  let calls = 0;
  await assert.rejects(() => runAiChatToolLoop({
    initialInput: [],
    request: async () => { calls++; return { output: [{ type: 'reasoning' }] }; },
    executeTool: async () => ({ ok: true })
  }), /Модель не вернула содержательный ответ/);
  assert.equal(calls, 2);
});

test('previous-image IDs are no longer inferred or sent by clients; ownership remains checked in generation', async () => {
  const [image, assistant, controller, api, web, mini, directEditor, documentEditor] = await Promise.all([
    readFile(new URL('../src/services/ai-image-generation.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/ai.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-user-image-edit.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-user-document-edit.service.ts', import.meta.url), 'utf8')
  ]);
  assert.match(image, /userId: input\.userId, mimeType: 'image\/png'/);
  assert.match(image, /images\/edits/);
  assert.match(image, /reserveAiCreditsMilliUpTo/);
  assert.match(image, /settleAiCreditReservation/);
  assert.match(image, /refundAiCreditReservation/);
  assert.doesNotMatch(web, /sourceImageId: \[\.\.\.history\]\.reverse/);
  assert.doesNotMatch(mini, /sourceImageId: \[\.\.\.history\]\.reverse/);
  assert.doesNotMatch(api, /sourceImageId\?: string/);
  assert.doesNotMatch(controller, /latestDocumentId|sourceDocumentId:|sourceImageId:/);
  assert.doesNotMatch(assistant, /input\.sourceImageId|isGeneratedImageEditRequest\(question\)/);
  assert.doesNotMatch(directEditor, /findFirst\(|previousId|input\.sourceImageId/);
  assert.doesNotMatch(documentEditor, /aiGeneratedDocument\.findFirst|input\.sourceDocumentId/);
});
