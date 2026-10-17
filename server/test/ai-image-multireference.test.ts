import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildAiFileCatalog } from '../src/services/ai-file-catalog.service.js';
import { AI_IMAGE_MODEL, AI_IMAGE_QUALITY, AI_IMAGE_MAX_REFERENCE_FILES, AI_IMAGE_TOOL, buildImageApiRequest, validateImageToolArguments } from '../src/services/ai-image-generation.service.js';
import { AI_EDIT_FILE_TOOL, resolveCatalogImageReferences, validateFileToolRequest } from '../src/services/ai-file-operations.service.js';

const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const uploaded = (name: string) => ({ name, mimeType: 'image/png', size: png.length, contentBase64: png.toString('base64') });
const images = [uploaded('base.png'), uploaded('object.png'), uploaded('style.png')];
const catalog = buildAiFileCatalog({ currentUploads: images });
const context = { userId: 'owner', catalog, uploads: images, model: 'gpt-6-luna', apiKey: 'unused', actionId: 'unit-test', dynamicBilling: false };

test('image tool explicitly selects base and references, or generates from scratch', () => {
  assert.equal(AI_IMAGE_MODEL, 'gpt-image-2.5-flare');
  assert.equal(AI_IMAGE_QUALITY, 'high');
  assert.equal(AI_IMAGE_MAX_REFERENCE_FILES, 5);
  assert.deepEqual(AI_IMAGE_TOOL.parameters.required, ['prompt', 'size', 'sourceFileIds']);
  assert.equal(AI_EDIT_FILE_TOOL.parameters.required.includes('referenceFileIds'), true);
  assert.deepEqual(validateImageToolArguments({ prompt: 'Нарисуй город', size: 'auto', sourceFileIds: [] }).sourceFileIds, []);
  assert.deepEqual(validateImageToolArguments({ prompt: 'Объедини картинки', size: 'auto', sourceFileIds: ['current:0','current:1'] }).sourceFileIds, ['current:0','current:1']);
  assert.throws(() => validateImageToolArguments({ prompt: 'Объедини картинки', size: 'auto', sourceFileIds: ['current:0','current:0'] }), /референсов/);
  assert.throws(() => validateImageToolArguments({ prompt: 'Объедини картинки', size: 'auto', sourceFileIds: Array(6).fill('current:0') }), /референсов/);
});

test('image provider request has every image in the requested order', async () => {
  const sources = await resolveCatalogImageReferences(context, ['current:2','current:0','current:1']);
  assert.equal(sources.length, 3);
  const { endpoint, payload } = buildImageApiRequest('Перенеси предмет из изображения №2', 'auto', sources);
  assert.match(endpoint, /images\/edits$/);
  assert.equal(payload.model, AI_IMAGE_MODEL);
  assert.equal(payload.quality, 'high');
  assert.match(payload.prompt, /основа результата/);
  assert.match(payload.prompt, /Перенеси предмет/);
  assert.deepEqual('images' in payload ? payload.images : [], sources.map((source) => ({
    image_url: 'data:' + source.mimeType + ';base64,' + source.contentBase64
  })));
  const newImage = buildImageApiRequest('Чистый лист', '1024x1024', []);
  assert.match(newImage.endpoint, /images\/generations$/);
  assert.equal('images' in newImage.payload, false);
});

test('image references are resolved against catalog, never silently dropped or inferred', async () => {
  await assert.rejects(resolveCatalogImageReferences(context, ['current:1','current:999']), /некорректные|недоступные/);
  await assert.rejects(resolveCatalogImageReferences(context, ['generated_document:random']), /некорректные|недоступные/);
  await assert.rejects(resolveCatalogImageReferences(context, ['current:0','current:0']), /некорректные|недоступные/);
  const doc = uploaded('contract.docx');
  const docContext = { ...context, uploads: [doc], catalog: buildAiFileCatalog({currentUploads: [doc]}) };
  await assert.rejects(resolveCatalogImageReferences(docContext, ['current:0']), /не является изображением/);
});

test('edit_file explicitly preserves target and accepts separate references', () => {
  const args = validateFileToolRequest({ fileId: 'current:0', instruction: 'Измени только фон', referenceFileIds: ['current:1','current:2'] }, 'edit');
  assert.equal(args?.fileId, 'current:0');
  assert.deepEqual(args?.referenceFileIds, ['current:1','current:2']);
  assert.equal(validateFileToolRequest({ fileId: 'current:0', instruction: 'Измени фон', referenceFileIds: ['current:0'] }, 'edit'), null);
  assert.equal(validateFileToolRequest({ fileId: 'current:0', instruction: 'Измени фон', referenceFileIds: Array(5).fill('a:b') }, 'edit'), null);
});

test('both chat surfaces pass authorized catalog images to generator', async () => {
  const [task, general, fileOperations] = await Promise.all([
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-chat-tools.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-file-operations.service.ts', import.meta.url), 'utf8')
  ]);
  assert.match(task, /resolveCatalogImageReferences/);
  assert.match(task, /args: imageArgs, sourceImages/);
  assert.match(general, /args,\s*sourceImages/);
  assert.match(fileOperations, /id: key, userId: input\.userId, taskId: input\.taskId \?\? null/);
  assert.match(fileOperations, /id: key, taskId: input\.taskId, userId: input\.userId/);
  assert.match(fileOperations, /referenceFileIds/);
});
