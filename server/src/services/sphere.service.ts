import { prisma } from '../db/prisma.js';

const MIN_SPHERES = 3;

export const sphereService = {
  list: (userId: string) => prisma.sphere.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
  create: (userId: string, input: any) =>
    prisma.sphere.create({
      data: {
        name: input.name,
        color: input.color ?? '#60a5fa',
        icon: input.icon,
        userId
      }
    }),
  update: async (id: string, userId: string, input: any) => {
    await prisma.sphere.findFirstOrThrow({ where: { id, userId } });
    return prisma.sphere.update({
      where: { id },
      data: {
        name: input.name,
        color: input.color,
        icon: input.icon
      }
    });
  },
  remove: async (id: string, userId: string) => {
    const total = await prisma.sphere.count({ where: { userId } });
    if (total <= MIN_SPHERES) {
      throw new Error(`MIN_SPHERES:${MIN_SPHERES}`);
    }

    await prisma.task.deleteMany({ where: { sphereId: id, userId } });
    const deleted = await prisma.sphere.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) {
      throw new Error('Sphere not found');
    }
  }
};
