import { prisma } from '../db/prisma.js';

const MIN_SPHERES = 3;

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
  update: (id: string, input: any) =>
    prisma.sphere.update({
      where: { id },
      data: {
        name: input.name,
        color: input.color,
        icon: input.icon
      }
    }),
  remove: async (id: string) => {
    const total = await prisma.sphere.count();
    if (total <= MIN_SPHERES) {
      throw new Error(`MIN_SPHERES:${MIN_SPHERES}`);
    }

    await prisma.task.deleteMany({ where: { sphereId: id } });
    await prisma.sphere.delete({ where: { id } });
  }
};
