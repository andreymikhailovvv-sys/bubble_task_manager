import { prisma } from '../db/prisma.js';
import { taskAccessWhere } from '../lib/task-access.js';
import { Prisma } from '@prisma/client';

type CreateTaskAttachmentInput = {
  name: string;
  mimeType: string;
  size: number;
  contentBase64: string;
};

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MIB = 1024 * 1024;
// ClickUp Free has 60 MB/workspace; here a smaller 50 MiB per-user
// budget protects the PostgreSQL/base64 backing store.
export const TASK_ATTACHMENT_STORAGE_LIMIT_MIB = { free: 50, start: 100, pro: 150, max: 250 } as const;
export const taskAttachmentLimitBytes = (plan: string | null | undefined): number =>
  (TASK_ATTACHMENT_STORAGE_LIMIT_MIB[plan as keyof typeof TASK_ATTACHMENT_STORAGE_LIMIT_MIB] ?? TASK_ATTACHMENT_STORAGE_LIMIT_MIB.free) * MIB;

export class TaskAttachmentQuotaError extends Error {
  readonly code = 'ATTACHMENT_STORAGE_LIMIT';
  constructor(readonly usedBytes: number, readonly limitBytes: number) {
    super('Недостаточно места для вложения. Лимит хранилища достигнут. Подробности в личном кабинете.');
    this.name = 'TaskAttachmentQuotaError';
  }
}
export const isQuotaError = (error: unknown): error is TaskAttachmentQuotaError => error instanceof TaskAttachmentQuotaError;

const SUPPORTED_TASK_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain'
]);

const isSupportedByExtension = (fileName: string) => /\.(pdf|docx|xlsx?|png|jpe?g|webp|gif|txt)$/i.test(fileName);

const sanitizeName = (name: string) => name.trim().slice(0, 180);

const ensureTaskAccess = (taskId: string, userId: string) => prisma.task.findFirstOrThrow({
  where: {
    id: taskId,
    AND: [taskAccessWhere(userId)]
  },
  select: { id: true }
});

export async function getTaskAttachmentStorage(userId: string) {
  const [user, aggregate] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { subscriptionPlan: true } }),
    prisma.taskAttachment.aggregate({ where: { userId }, _sum: { size: true }, _count: { _all: true } })
  ]);
  const usedBytes = aggregate._sum.size ?? 0;
  const limitBytes = taskAttachmentLimitBytes(user.subscriptionPlan);
  return { usedBytes, limitBytes, count: aggregate._count._all, overLimit: usedBytes > limitBytes, plan: user.subscriptionPlan };
}

export const taskAttachmentService = {
  storage: getTaskAttachmentStorage,
  listOwned: async (userId: string) => {
    const files = await prisma.taskAttachment.findMany({
      where: { userId },
      select: {
        id: true, taskId: true, name: true, mimeType: true, size: true, createdAt: true,
        task: { select: { title: true, parentTask: { select: { title: true, id: true } } } }
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });
    return files.map(({ task, ...file }) => ({
      ...file, taskTitle: task.title, parentTaskId: task.parentTask?.id ?? null,
      parentTaskTitle: task.parentTask?.title ?? null
    }));
  },
  removeOwned: async (attachmentId: string, userId: string) => {
    const deleted = await prisma.taskAttachment.deleteMany({ where: { id: attachmentId, userId } });
    if (!deleted.count) throw new Error('Вложение не найдено или недоступно для удаления.');
    return { ok: true };
  },
  list: async (taskId: string, userId: string) => {
    await ensureTaskAccess(taskId, userId);
    return prisma.taskAttachment.findMany({
      where: { taskId },
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
      throw new TypeError('Поддерживаются PDF, DOCX, XLS/XLSX, TXT и изображения (PNG/JPG/WEBP/GIF)');
    }

    const size = Number(input.size);
    if (!Number.isFinite(size) || size < 1 || size > MAX_ATTACHMENT_BYTES) {
      throw new TypeError('Некорректный размер файла (максимум 8MB)');
    }

    const contentBase64 = String(input.contentBase64 ?? '').trim();
    if (!contentBase64) {
      throw new TypeError('Пустое содержимое файла');
    }

    // Validate actual bytes before charging storage. A claimed size or
    // altered MIME header alone cannot bypass the quota.
    if (contentBase64.length > Math.ceil(MAX_ATTACHMENT_BYTES * 4 / 3) + 16 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64) ||
        Buffer.byteLength(contentBase64, 'base64') !== size) {
      throw new TypeError('Некорректное содержимое вложения или несовпадение размера файла.');
    }

    // Serializable prevents two concurrent uploads from each observing the
    // same remaining quota. Existing over-limit files are never removed.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await prisma.$transaction(async (tx) => {
          const task = await tx.task.findFirst({
            where: { id: taskId, AND: [taskAccessWhere(userId)] }, select: { id: true }
          });
          if (!task) throw new Error('Задача недоступна');
          const user = await tx.user.findUniqueOrThrow({
            where: { id: userId }, select: { subscriptionPlan: true }
          });
          const aggregate = await tx.taskAttachment.aggregate({
            where: { userId }, _sum: { size: true }
          });
          const usedBytes = aggregate._sum.size ?? 0;
          const limitBytes = taskAttachmentLimitBytes(user.subscriptionPlan);
          if (usedBytes + size > limitBytes) throw new TaskAttachmentQuotaError(usedBytes, limitBytes);
          return tx.taskAttachment.create({
            data: {
              taskId, userId, name, mimeType: mimeType || 'application/octet-stream',
              size, contentBase64
            },
            select: { id: true, taskId: true, name: true, mimeType: true, size: true, createdAt: true, updatedAt: true }
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue;
        throw error;
      }
    }
    throw new Error('Не удалось сохранить файл. Повторите попытку.');
  },
  remove: async (taskId: string, attachmentId: string, userId: string) => {
    await ensureTaskAccess(taskId, userId);
    const deleted = await prisma.taskAttachment.deleteMany({ where: { id: attachmentId, taskId } });
    if (deleted.count === 0) {
      throw new Error('Файл не найден');
    }
  },
  getContent: async (taskId: string, attachmentId: string, userId: string) => {
    await ensureTaskAccess(taskId, userId);
    const attachment = await prisma.taskAttachment.findFirst({
      where: { id: attachmentId, taskId },
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
    await ensureTaskAccess(taskId, userId);
    return prisma.taskAttachment.findMany({
      where: { taskId },
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
