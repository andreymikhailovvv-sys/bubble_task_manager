import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import {
  TASK_ATTACHMENT_DOWNLOAD_PURPOSE,
  signTaskAttachmentDownloadToken,
  verifyTaskAttachmentDownloadToken
} from '../src/services/task-attachment-download.service.js';

process.env.JWT_SECRET = 'task-attachment-download-test-secret';

test.after(() => {
  delete process.env.JWT_SECRET;
});

test('короткоживущая ссылка сохраняет владельца, задачу и вложение', () => {
  const token = signTaskAttachmentDownloadToken({ taskId: 'task-1', attachmentId: 'attachment-1', userId: 'user-1' });
  const payload = verifyTaskAttachmentDownloadToken(token);
  assert.deepEqual(payload, {
    taskId: 'task-1',
    attachmentId: 'attachment-1',
    userId: 'user-1',
    purpose: TASK_ATTACHMENT_DOWNLOAD_PURPOSE
  });
});

test('истёкшая ссылка и токен другого назначения отклоняются', () => {
  const base = { taskId: 'task-1', attachmentId: 'attachment-1', userId: 'user-1' };
  const expired = jwt.sign({ ...base, purpose: TASK_ATTACHMENT_DOWNLOAD_PURPOSE }, process.env.JWT_SECRET!, { expiresIn: -1 });
  const wrongPurpose = jwt.sign({ ...base, purpose: 'auth' }, process.env.JWT_SECRET!, { expiresIn: 300 });
  assert.throws(() => verifyTaskAttachmentDownloadToken(expired));
  assert.throws(() => verifyTaskAttachmentDownloadToken(wrongPurpose));
});
