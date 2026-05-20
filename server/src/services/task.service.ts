import { Prisma, type Prisma as PrismaTypes } from '@prisma/client';
import { prisma } from '../db/prisma.js';

interface TaskInput {
  title?: string;
  description?: string | null;
  sphereId?: string | null;
  parentTaskId?: string | null;
  importance?: number | string;
  urgency?: number | string;
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
  dueDate?: string | Date | null;
  notifyBeforeMinutes?: number | string | null;
  isRecurring?: boolean;
  recurrenceText?: string | null;
  recurrenceJson?: PrismaTypes.InputJsonValue | null;
  recurrenceSummary?: string | null;
  recurrenceUntil?: string | Date | null;
}

const toRecurrenceJson = (value: PrismaTypes.InputJsonValue | null | undefined): PrismaTypes.InputJsonValue | PrismaTypes.NullableJsonNullValueInput | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value;
};

interface CreateTaskInput extends TaskInput {
  title: string;
}

const calcScore = (importance: number, urgency: number) => Number((importance * 0.6 + urgency * 0.4).toFixed(2));

const toNumber = (value: number | string, fieldName: 'importance' | 'urgency'): number => {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numericValue)) {
    throw new TypeError(`Invalid ${fieldName} value`);
  }
  return numericValue;
};

const toDueDate = (value: string | Date | null): Date | null => {
  if (value === null) {
    return null;
  }

  const dateValue = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    throw new TypeError('Invalid dueDate value');
  }
  return dateValue;
};

const toNotifyBeforeMinutes = (value: number | string | null): number | null => {
  if (value === null) return null;
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 1) {
    throw new TypeError('Invalid notifyBeforeMinutes value');
  }
  return Math.round(numericValue);
};

export const taskService = {
  list: (userId: string) => prisma.task.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
  create: async (userId: string, input: CreateTaskInput) => {
    const importance = toNumber(input.importance ?? 3, 'importance');
    const urgency = toNumber(input.urgency ?? 3, 'urgency');

    const created = await prisma.task.create({
      data: {
        title: input.title,
        user: { connect: { id: userId } },
        description: input.description,
        sphere: input.sphereId ? { connect: { id: input.sphereId } } : undefined,
        parentTask: input.parentTaskId ? { connect: { id: input.parentTaskId } } : undefined,
        importance,
        urgency,
        priorityScore: calcScore(importance, urgency),
        status: input.status ?? 'TODO',
        dueDate: input.dueDate !== undefined ? toDueDate(input.dueDate) : null,
        notifyBeforeMinutes: input.notifyBeforeMinutes !== undefined ? toNotifyBeforeMinutes(input.notifyBeforeMinutes) : 30
        ,
        isRecurring: input.isRecurring ?? false,
        recurrenceText: input.recurrenceText ?? null,
        recurrenceJson: toRecurrenceJson(input.recurrenceJson),
        recurrenceSummary: input.recurrenceSummary ?? null,
        recurrenceUntil: input.recurrenceUntil !== undefined ? toDueDate(input.recurrenceUntil) : null
      }
    });
    console.info('[Task] create', { userId, taskId: created.id, parentTaskId: created.parentTaskId, status: created.status, dueDate: created.dueDate?.toISOString() ?? null });
    return created;
  },
  update: async (id: string, userId: string, input: TaskInput) => {
    const patch: Prisma.TaskUpdateInput = {};

    if (input.title !== undefined) {
      patch.title = input.title;
    }
    if (input.description !== undefined) {
      patch.description = input.description;
    }
    if (input.sphereId !== undefined) {
      patch.sphere = input.sphereId ? { connect: { id: input.sphereId } } : { disconnect: true };
    }
    if (input.status !== undefined) {
      patch.status = input.status;
    }
    if (input.parentTaskId !== undefined) {
      patch.parentTask = input.parentTaskId ? { connect: { id: input.parentTaskId } } : { disconnect: true };
    }
    if (input.importance !== undefined) {
      patch.importance = toNumber(input.importance, 'importance');
    }
    if (input.urgency !== undefined) {
      patch.urgency = toNumber(input.urgency, 'urgency');
    }

    if (input.importance !== undefined || input.urgency !== undefined) {
      const current = await prisma.task.findFirstOrThrow({ where: { id, userId } });
      const importance = toNumber(input.importance ?? current.importance, 'importance');
      const urgency = toNumber(input.urgency ?? current.urgency, 'urgency');
      patch.priorityScore = calcScore(importance, urgency);
    }

    if (input.dueDate !== undefined) {
      patch.dueDate = toDueDate(input.dueDate);
    }
    if (input.notifyBeforeMinutes !== undefined) {
      patch.notifyBeforeMinutes = toNotifyBeforeMinutes(input.notifyBeforeMinutes);
    }
    if (input.isRecurring !== undefined) patch.isRecurring = Boolean(input.isRecurring);
    if (input.recurrenceText !== undefined) patch.recurrenceText = input.recurrenceText;
    if (input.recurrenceJson !== undefined) patch.recurrenceJson = toRecurrenceJson(input.recurrenceJson);
    if (input.recurrenceSummary !== undefined) patch.recurrenceSummary = input.recurrenceSummary;
    if (input.recurrenceUntil !== undefined) patch.recurrenceUntil = toDueDate(input.recurrenceUntil);

    if (input.status !== undefined || input.dueDate !== undefined || input.notifyBeforeMinutes !== undefined) {
      patch.telegramNotifiedAt = null;
    }

    const currentTask = await prisma.task.findFirstOrThrow({
      where: { id, userId }
    });

    return prisma.$transaction(async (tx) => {
      const updatedTask = await tx.task.update({ where: { id }, data: patch });
      console.info('[Task] update', { userId, taskId: id, beforeStatus: currentTask.status, afterStatus: updatedTask.status, beforeDueDate: currentTask.dueDate?.toISOString() ?? null, afterDueDate: updatedTask.dueDate?.toISOString() ?? null, parentTaskId: currentTask.parentTaskId });

      if (input.status === 'DONE' && !currentTask.parentTaskId) {
        await tx.task.updateMany({
          where: { parentTaskId: id, userId, status: { not: 'DONE' } },
          data: { status: 'DONE', telegramNotifiedAt: null }
        });
      }

      return updatedTask;
    });
  },
  remove: async (id: string, userId: string) => {
    const existing = await prisma.task.findFirst({ where: { id, userId }, select: { id: true, parentTaskId: true, status: true, dueDate: true } });
    const deleted = await prisma.task.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) {
      throw new Error('Task not found');
    }
    console.info('[Task] remove', { userId, taskId: id, parentTaskId: existing?.parentTaskId ?? null, status: existing?.status ?? null, dueDate: existing?.dueDate?.toISOString() ?? null });
  }
};
