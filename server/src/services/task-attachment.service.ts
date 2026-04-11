import { prisma } from '../db/prisma.js';

type CreateTaskAttachmentInput = {
  name: string;
  mimeType: string;
  size: number;
  contentBase64: string;
};

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const SUPPORTED_TASK_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]);

const isSupportedByExtension = (fileName: string) => /\.(pdf|docx|png|jpe?g|webp|gif)$/i.test(fileName);

const sanitizeName = (name: string) => name.trim().slice(0, 180);

export const taskAttachmentService = {
  list: async (taskId: string, userId: string) => {
    await prisma.task.findFirstOrThrow({ where: { id: taskId, userId } });
    return prisma.taskAttachment.findMany({
      where: { taskId, userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        taskId: true,
        name: true,
        mimeType: true,
        size: true,
        createdAt: true,
        updatedAt: true
      }
    });
  },
  create: async (taskId: string, userId: string, input: CreateTaskAttachmentInput) => {
    const name = sanitizeName(input.name);
    if (!name) {
      throw new TypeError('Название файла обязательно');
    }

    const mimeType = String(input.mimeType ?? '').trim();
    const isSupportedMime = SUPPORTED_TASK_ATTACHMENT_TYPES.has(mimeType);
    if (!isSupportedMime && !isSupportedByExtension(name)) {
      throw new TypeError('Поддерживаются только PDF, DOCX и изображения (PNG/JPG/WEBP/GIF)');
    }

    const size = Number(input.size);
    if (!Number.isFinite(size) || size < 1 || size > MAX_ATTACHMENT_BYTES) {
      throw new TypeError('Некорректный размер файла (максимум 8MB)');
    }

    const contentBase64 = String(input.contentBase64 ?? '').trim();
    if (!contentBase64) {
      throw new TypeError('Пустое содержимое файла');
    }

    await prisma.task.findFirstOrThrow({ where: { id: taskId, userId } });

    return prisma.taskAttachment.create({
      data: {
        taskId,
        userId,
        name,
        mimeType: mimeType || 'application/octet-stream',
        size: Math.round(size),
        contentBase64
      },
      select: {
        id: true,
        taskId: true,
        name: true,
        mimeType: true,
        size: true,
        createdAt: true,
        updatedAt: true
      }
    });
  },
  remove: async (taskId: string, attachmentId: string, userId: string) => {
    const deleted = await prisma.taskAttachment.deleteMany({ where: { id: attachmentId, taskId, userId } });
    if (deleted.count === 0) {
      throw new Error('Файл не найден');
    }
  },
  getContent: async (taskId: string, attachmentId: string, userId: string) => {
    const attachment = await prisma.taskAttachment.findFirst({
      where: { id: attachmentId, taskId, userId },
      select: {
        name: true,
        mimeType: true,
        contentBase64: true
      }
    });
    if (!attachment) {
      throw new Error('Файл не найден');
    }
    return attachment;
  },
  listForAi: async (taskId: string, userId: string) => {
    return prisma.taskAttachment.findMany({
      where: { taskId, userId },
      orderBy: { createdAt: 'asc' },
      select: {
        name: true,
        mimeType: true,
        size: true,
        contentBase64: true
      }
    });
  }
};
