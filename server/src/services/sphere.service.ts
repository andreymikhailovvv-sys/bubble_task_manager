import { prisma } from '../db/prisma.js';

export const sphereService = {
  list: () => prisma.sphere.findMany({ orderBy: { createdAt: 'asc' } }),
  create: (input: any) =>
    prisma.sphere.create({
      data: {
        name: input.name,
        color: input.color ?? '#60a5fa',
        icon: input.icon
      }
    }),
  remove: async (id: string) => {
    await prisma.task.deleteMany({ where: { sphereId: id } });
    await prisma.sphere.delete({ where: { id } });
  }
};
