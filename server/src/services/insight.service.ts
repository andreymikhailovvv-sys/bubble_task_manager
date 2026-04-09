import type { Sphere, Task } from '@prisma/client';
import { prisma } from '../db/prisma.js';

export const insightService = {
  list: async (userId: string) => {
    const [tasks, spheres] = await Promise.all([
      prisma.task.findMany({ where: { userId } }),
      prisma.sphere.findMany({ where: { userId } })
    ]);
    const now = new Date();
    const overdue = tasks.filter((t: Task) => t.dueDate && t.dueDate < now && t.status !== 'DONE').length;
    const hotCenter = tasks.filter((t: Task) => t.priorityScore >= 4.2 && t.status !== 'DONE').length;
    const noDeadlineSpheres = spheres
      .filter(
        (s: Sphere) =>
          tasks.some((t: Task) => t.sphereId === s.id) &&
          tasks.filter((t: Task) => t.sphereId === s.id).every((t: Task) => !t.dueDate)
      )
      .map((s: Sphere) => s.name);

    return [
      {
        id: 'overloaded',
        text: hotCenter > 5 ? 'Слишком много задач в центре. Подумайте о делегировании.' : 'Нагрузка в центре поля пока сбалансирована.'
      },
      { id: 'overdue', text: overdue > 0 ? `Есть ${overdue} просроченные задачи.` : 'Просроченных задач нет.' },
      {
        id: 'deadlines',
        text: noDeadlineSpheres[0] ? `В сфере ${noDeadlineSpheres[0]} нет задач с дедлайном.` : 'Во всех активных сферах есть дедлайны.'
      }
    ];
  }
};
