import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateUploadedImage, selectUploadedImageForEdit } from '../src/services/ai-user-image-input.js';

const upload = (name: string, mimeType: string, bytes: Buffer) => ({
  name, mimeType, size: bytes.length, contentBase64: bytes.toString('base64')
});

test('a GIF edit request gives a human-readable conversion action instead of vanishing', () => {
  const gif = upload('example.gif', 'image/gif', Buffer.from('GIF89a' + '\0'.repeat(24), 'binary'));
  assert.throws(() => validateUploadedImage(gif), /GIF.*PNG/);
  assert.throws(() => selectUploadedImageForEdit([gif], true), /GIF.*PNG/);
});

test('invalid image attachments fail before charge while valid PNG stays accepted', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const invalid = upload('fake.png', 'image/png', Buffer.from('This is not a photo.'));
  assert.equal(validateUploadedImage(upload('valid.png', 'image/png', png)).mimeType, 'image/png');
  assert.throws(() => validateUploadedImage(invalid), /не распознан как PNG, JPEG или WebP/);
});

test('client GIF conversion runs only on chat payload, keeps regular task attachments', async () => {
  const [converter,web,mini] = await Promise.all([
    readFile(new URL('../../client/src/lib/ai-image-upload.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(converter, /export async function prepareAiChatImageFile/);
  assert.match(converter, /canvas\.toBlob/);
  assert.match(converter, /image\/png/);
  assert.match(converter, /URL\.revokeObjectURL/);
  assert.match(web, /forAiChat \? await prepareAiChatImageFile\(file\) : file/);
  assert.match(mini, /forAiChat \? await prepareAiChatImageFile\(file\) : file/);
  assert.match(web, /createTaskAttachment\(focusedTask\.id, await fileToAttachmentPayload\(file\)\)/);
  assert.match(mini, /createTaskAttachment\(openedTask\.id, await fileToAttachmentPayload\(file\)\)/);
  assert.match(web, /aiPendingFiles\.map\(\(file\) => fileToAttachmentPayload\(file, true\)\)/);
  assert.match(mini, /aiPendingFiles\.map\(\(file\) => fileToAttachmentPayload\(file, true\)\)/);
});

test('failed task image edits show original error and leave prompt and file for retry', async () => {
  const [web,mini,controller,api] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/ai.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/api.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(controller, /writeStreamEvent\(\{ type: 'error', message \}\)/);
  assert.match(api, /if \(event\.type === 'error'\) throw new Error\(event\.message\)/);
  assert.match(web, /error instanceof Error && error\.message\.trim\(\)/);
  assert.match(web, /setAiPendingFiles\(\(current\) => current\.length \? current : aiPendingFiles\)/);
  assert.match(web, /setFocusAiPendingFiles\(\(current\) => current\.length \? current : focusAiPendingFiles\)/);
  assert.match(mini, /setAiPendingFiles\(\(current\) => current\.length \? current : aiPendingFiles\)/);
  assert.match(mini, /setAiDialogByTask\(\(prev\) => \(\{[\s\S]*?\[openedTask\.id\]: \[\.\.\.nextDialog, \{ role: 'assistant', content: message \}\]/);
});
