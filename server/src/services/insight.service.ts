import { prisma } from '../db/prisma.js';

export const insightService = {
  list: async () => {
    const [tasks, spheres] = await Promise.all([prisma.task.findMany(), prisma.sphere.findMany()]);
    const now = new Date();
    const overdue = tasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== 'DONE').length;
    const hotCenter = tasks.filter((t) => t.priorityScore >= 4.2 && t.status !== 'DONE').length;
    const noDeadlineSpheres = spheres
      .filter((s) => tasks.some((t) => t.sphereId === s.id) && tasks.filter((t) => t.sphereId === s.id).every((t) => !t.dueDate))
      .map((s) => s.name);

    return [
      { id: 'overloaded', text: hotCenter > 5 ? 'Слишком много задач в центре. Подумайте о делегировании.' : 'Нагрузка в центре поля пока сбалансирована.' },
      { id: 'overdue', text: overdue > 0 ? `Есть ${overdue} просроченные задачи.` : 'Просроченных задач нет.' },
      { id: 'deadlines', text: noDeadlineSpheres[0] ? `В сфере ${noDeadlineSpheres[0]} нет задач с дедлайном.` : 'Во всех активных сферах есть дедлайны.' }
    ];
  }
};
