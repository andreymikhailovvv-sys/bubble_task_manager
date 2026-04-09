import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID ?? 'system_migration_user';

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
}

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
  list: () => prisma.task.findMany({ where: { userId: DEFAULT_USER_ID }, orderBy: { createdAt: 'desc' } }),
  create: async (input: CreateTaskInput) => {
    const importance = toNumber(input.importance ?? 3, 'importance');
    const urgency = toNumber(input.urgency ?? 3, 'urgency');

    return prisma.task.create({
      data: {
        title: input.title,
        user: { connect: { id: DEFAULT_USER_ID } },
        description: input.description,
        sphere: input.sphereId ? { connect: { id: input.sphereId } } : undefined,
        parentTask: input.parentTaskId ? { connect: { id: input.parentTaskId } } : undefined,
        importance,
        urgency,
        priorityScore: calcScore(importance, urgency),
        status: input.status ?? 'TODO',
        dueDate: input.dueDate !== undefined ? toDueDate(input.dueDate) : null,
        notifyBeforeMinutes: input.notifyBeforeMinutes !== undefined ? toNotifyBeforeMinutes(input.notifyBeforeMinutes) : 60
      }
    });
  },
  update: async (id: string, input: TaskInput) => {
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
      const current = await prisma.task.findFirstOrThrow({ where: { id, userId: DEFAULT_USER_ID } });
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

    return prisma.task.update({ where: { id }, data: patch });
  },
  remove: async (id: string) => {
    await prisma.task.delete({ where: { id } });
  }
};
