import { TaskStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';

const calcScore = (importance: number, urgency: number) => Number((importance * 0.6 + urgency * 0.4).toFixed(2));

export const taskService = {
  list: () => prisma.task.findMany({ orderBy: { createdAt: 'desc' } }),
  create: async (input: any) => {
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
        status: input.status ?? TaskStatus.TODO,
        dueDate: input.dueDate ? new Date(input.dueDate) : null
      }
    });
  },
  update: async (id: string, input: any) => {
    const patch: any = { ...input };
    if (input.importance || input.urgency) {
      const current = await prisma.task.findUniqueOrThrow({ where: { id } });
      const importance = Number(input.importance ?? current.importance);
      const urgency = Number(input.urgency ?? current.urgency);
      patch.priorityScore = calcScore(importance, urgency);
    }
    if (input.dueDate !== undefined) patch.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    return prisma.task.update({ where: { id }, data: patch });
  },
  remove: async (id: string) => {
    await prisma.task.delete({ where: { id } });
  }
};
