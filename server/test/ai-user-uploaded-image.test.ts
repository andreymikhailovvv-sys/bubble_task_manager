import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { selectUploadedImageForEdit, validateUploadedImage } from '../src/services/ai-user-image-input.js';
import { isGeneratedImageEditRequest } from '../src/services/ai-image-edit-intent.js';

const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const jpeg = Buffer.from([255,216,255,224,0,16,74,70,73,70,255,217]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(4)]);
const attachment = (name: string, mimeType: string, bytes: Buffer) => ({
  name, mimeType, size: bytes.length, contentBase64: bytes.toString('base64')
});

test('uploads accept actual PNG, JPEG and WebP signatures', () => {
  assert.equal(validateUploadedImage(attachment('source.png','image/png',png)).mimeType,'image/png');
  assert.equal(validateUploadedImage(attachment('source.jpg','image/jpeg',jpeg)).mimeType,'image/jpeg');
  assert.equal(validateUploadedImage(attachment('source.webp','image/webp',webp)).mimeType,'image/webp');
});

test('spoofed, damaged, oversize and ambiguous input never reaches generator', () => {
  assert.throws(() => validateUploadedImage(attachment('fake.png','image/png',Buffer.from('not-image-here'))));
  assert.throws(() => validateUploadedImage(attachment('bad.png','image/png',jpeg)), /не соответствует/);
  assert.throws(() => validateUploadedImage({ ...attachment('small.png','image/png',png), size: 999 }));
  assert.throws(() => validateUploadedImage({ ...attachment('large.png','image/png',png), contentBase64: 'A'.repeat(12_000_000) }));
  assert.throws(() => selectUploadedImageForEdit([
    attachment('a.png','image/png',png), attachment('b.png','image/png',png)
  ], true), /несколько изображений/);
});

test('editing current upload takes precedence, ordinary questions do not edit images', () => {
  const source = attachment('user-photo.jpg','image/jpeg',jpeg);
  assert.ok(isGeneratedImageEditRequest('Измени картинку, сделай небо розовым'));
  assert.equal(selectUploadedImageForEdit([source], true)?.mimeType, 'image/jpeg');
  assert.equal(selectUploadedImageForEdit([source], false), null);
  assert.equal(isGeneratedImageEditRequest('Найди задачи на сегодня'), false);
});

test('integration routes user bytes to GPT Image with existing metering', async () => {
  const [service, handler, controller, ui, tool] = await Promise.all([
    readFile(new URL('../src/services/ai-image-generation.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-user-image-edit.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/ai.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/AiProgress.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-chat-tools.service.ts', import.meta.url), 'utf8')
  ]);
  assert.match(service, /uploadedSourceImage/);
  assert.match(service, /images\/edits/);
  assert.match(service, /reserveAiCreditsMilliUpTo/);
  assert.match(service, /settleAiCreditReservation/);
  assert.match(service, /refundAiCreditReservation/);
  assert.match(handler, /uploadedSourceImage: uploaded/);
  assert.doesNotMatch(handler, /previousId|sourceImageId|aiGeneratedDocument\.findFirst/);
  assert.match(handler, /taskId: input\.taskId/);
  assert.match(controller, /directImageEdit \?\? (?:directDocumentEdit \?\? )?await aiAssistantService\.askAiChat/);
  assert.match(controller, /directImageEdit \?\? (?:directDocumentEdit \?\? )?await aiAssistantService\.askTaskAssistant/);
  assert.match(ui, /Редактирую изображение/);
  assert.match(tool, /name === 'generate_image'/);
});
