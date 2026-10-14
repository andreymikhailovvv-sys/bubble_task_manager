import { prisma } from '../db/prisma.js';
import { taskAccessWhere } from '../lib/task-access.js';

export type ConversationUpload = { name: string; mimeType: string; size: number; contentBase64: string };
type UploadScope = { userId: string; messageId?: string; taskId?: string; projectId?: string; chatId?: string };
const MAX_UPLOADS = 3;
const MAX_BYTES = 8 * 1024 * 1024;
const RETAIN_RECENT = 24;
const isUuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const scopedId = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 128;

export function validateConversationUploads(files: ConversationUpload[]): ConversationUpload[] {
  if (!Array.isArray(files) || files.length > MAX_UPLOADS) throw new TypeError('В одно сообщение можно прикрепить не более трёх файлов.');
  return files.map((file) => {
    if (!file || typeof file.name !== 'string' || typeof file.mimeType !== 'string' || typeof file.contentBase64 !== 'string' ||
      file.name.length < 1 || file.name.length > 180 || file.mimeType.length > 128 ||
      !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_BYTES ||
      file.contentBase64.length > Math.ceil(MAX_BYTES * 4 / 3) + 16 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(file.contentBase64)) throw new TypeError('Некорректное вложение или превышен лимит 8 МБ.');
    const bytes = Buffer.from(file.contentBase64, 'base64');
    if (bytes.length !== file.size) throw new TypeError('Размер вложения не совпадает с содержимым.');
    return file;
  });
}

/**
 * Persist after a successful request, before marking it replayable. User and
 * task scoping are never derived from client-provided attachment metadata.
 * Fails closed on storage errors to prevent claiming that a file was saved.
 */
export async function saveConversationUploads(input: UploadScope & { files?: ConversationUpload[] }): Promise<void> {
  if (!input.files?.length || !isUuid(input.messageId)) return;
  const files = validateConversationUploads(input.files);
  if (input.taskId) {
    const task = await prisma.task.findFirst({ where: { id: input.taskId, AND: [taskAccessWhere(input.userId)] }, select: { id: true } });
    if (!task) throw new Error('Недоступная задача');
  } else if (!scopedId(input.projectId) || !scopedId(input.chatId)) {
    // Quick requests and unscoped chats don't have stable durable storage.
    return;
  }
  await prisma.aiConversationAttachment.createMany({
    data: files.map((file, ordinal) => ({
      userId: input.userId,
      taskId: input.taskId ?? null,
      projectId: input.taskId ? null : input.projectId!,
      chatId: input.taskId ? null : input.chatId!,
      messageId: input.messageId!,
      ordinal, fileName: file.name, mimeType: file.mimeType, size: file.size, contentBase64: file.contentBase64
    })),
    skipDuplicates: true
  });
  const where = input.taskId
    ? { userId: input.userId, taskId: input.taskId }
    : { userId: input.userId, taskId: null, projectId: input.projectId!, chatId: input.chatId! };
  const stale = await prisma.aiConversationAttachment.findMany({
    where, select: { id: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: RETAIN_RECENT
  });
  if (stale.length) await prisma.aiConversationAttachment.deleteMany({ where: { id: { in: stale.map((row) => row.id) }, userId: input.userId } });
}
