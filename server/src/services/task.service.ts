import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

interface TaskInput {
  title?: string;
  description?: string | null;
  sphereId?: string | null;
  importance?: number | string;
  urgency?: number | string;
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
  dueDate?: string | Date | null;
}

interface CreateTaskInput extends TaskInput {
  title: string;
}

const calcScore = (importance: number, urgency: number) => Number((importance * 0.6 + urgency * 0.4).toFixed(2));

export const taskService = {
  list: () => prisma.task.findMany({ orderBy: { createdAt: 'desc' } }),
  create: async (input: CreateTaskInput) => {
    const importance = Number(input.importance ?? 3);
    const urgency = Number(input.urgency ?? 3);

    return prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        sphereId: input.sphereId,
        importance,
        urgency,
        priorityScore: calcScore(importance, urgency),
        status: input.status ?? 'TODO',
        dueDate: input.dueDate ? new Date(input.dueDate) : null
      }
    });
  },
  update: async (id: string, input: TaskInput) => {
    const patch: Prisma.TaskUpdateInput = { ...input };

    if (input.importance !== undefined || input.urgency !== undefined) {
      const current = await prisma.task.findUniqueOrThrow({ where: { id } });
      const importance = Number(input.importance ?? current.importance);
      const urgency = Number(input.urgency ?? current.urgency);
      patch.priorityScore = calcScore(importance, urgency);
    }

    if (input.dueDate !== undefined) {
      patch.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    }

    return prisma.task.update({ where: { id }, data: patch });
  },
  remove: async (id: string) => {
    await prisma.task.delete({ where: { id } });
  }
};
