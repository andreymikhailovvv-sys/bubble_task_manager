import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { AI_IMAGE_MODEL, AI_IMAGE_TOOL, calculateImageCostNanoUsd, decodeGeneratedImage, validateImageToolArguments } from '../src/services/ai-image-generation.service.js';
import { providerNanoUsdToMilliCredits } from '../src/services/ai-usage-metering.service.js';

test('image tool strictly validates prompt and dimensions', () => {
  assert.equal(AI_IMAGE_MODEL, 'gpt-image-2');
  assert.equal(AI_IMAGE_TOOL.name, 'generate_image');
  assert.equal(validateImageToolArguments({ prompt: '  Космос  ', size: '1536x1024' }).prompt, 'Космос');
  assert.throws(() => validateImageToolArguments({ prompt: '', size: '1024x1024' }), /Промпт/);
  assert.throws(() => validateImageToolArguments({ prompt: 'a'.repeat(3201), size: '1024x1024' }), /Промпт/);
  assert.throws(() => validateImageToolArguments({ prompt: 'пейзаж', size: '9999x9999' }), /размер/);
});

test('image usage applies GPT Image 2 standard modality rates and mill-credit rounding', () => {
  const usdNano = calculateImageCostNanoUsd({
    input_tokens: 100, input_tokens_details: { text_tokens: 100, image_tokens: 0 }, output_tokens: 1000
  });
  assert.equal(usdNano, 15_250_000n);
  assert.equal(providerNanoUsdToMilliCredits(usdNano!), 25_417);
  assert.equal(calculateImageCostNanoUsd({ input_tokens: 10 }), null);
});

test('PNG payload is validated and no base64 is delivered to the language model', async () => {
  const buffer = Buffer.alloc(110); Buffer.from([137,80,78,71,13,10,26,10]).copy(buffer);
  assert.equal(decodeGeneratedImage(buffer.toString('base64')).length, 110);
  assert.throws(() => decodeGeneratedImage(Buffer.from('Hello').toString('base64')), /некорректный/);
  const src = await readFile(new URL('../src/services/ai-image-generation.service.ts', import.meta.url), 'utf8');
  assert.match(src, /reserveAiCreditsMilliUpTo/);
  assert.match(src, /settleAiCreditReservation/);
  assert.match(src, /recordAiCreditCharge/);
  assert.match(src, /image_generation/);
  assert.match(src, /prisma\.aiGeneratedDocument\.create/);
});

test('general chat, task chat and focus path use the same image tool and download file', async () => {
  const [tools, assistant, controller, button, stats] = await Promise.all([
    readFile(new URL('../src/services/ai-chat-tools.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/ai.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/AiGeneratedDocumentButton.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-credit-statistics.service.ts', import.meta.url), 'utf8')
  ]);
  assert.match(tools, /AI_IMAGE_TOOL/);
  assert.match(tools, /await generateAiImage/);
  assert.match(tools, /imageCreditsSpentMilli/);
  assert.match(assistant, /tools: \[TASK_CONTEXT_LOOKUP_TOOL, AI_IMAGE_TOOL, AI_READ_FILE_TOOL, AI_EDIT_FILE_TOOL, TELEGRAM_PREPARE_SEND_TOOL\]/);
  assert.match(assistant, /await generateAiImage/);
  assert.match(assistant, /generatedDocument = generatedImage\?\.document \?\? editedFileDocument/);
  assert.match(assistant, /creditsSpentMilli = \(generatedImage\?\.creditsSpentMilli \?\? 0\) \+ editedFileCreditsMilli/);
  assert.match(controller, /generatedDocumentId: result\.generatedDocument\?\.id/);
  assert.match(button, /FileImage/);
  assert.match(stats, /image_generation: 'Генерация изображений'/);
  assert.match(stats, /'gpt-image-2': 'GPT Image 2'/);
});
