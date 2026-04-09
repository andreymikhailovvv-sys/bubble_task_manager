import { prisma } from '../db/prisma.js';

const MIN_SPHERES = 3;
const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID ?? 'system_migration_user';

export const sphereService = {
  list: () => prisma.sphere.findMany({ where: { userId: DEFAULT_USER_ID }, orderBy: { createdAt: 'asc' } }),
  create: (input: any) =>
    prisma.sphere.create({
      data: {
        name: input.name,
        color: input.color ?? '#60a5fa',
        icon: input.icon,
        userId: DEFAULT_USER_ID
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
    const total = await prisma.sphere.count({ where: { userId: DEFAULT_USER_ID } });
    if (total <= MIN_SPHERES) {
      throw new Error(`MIN_SPHERES:${MIN_SPHERES}`);
    }

    await prisma.task.deleteMany({ where: { sphereId: id, userId: DEFAULT_USER_ID } });
    await prisma.sphere.delete({ where: { id } });
  }
};
