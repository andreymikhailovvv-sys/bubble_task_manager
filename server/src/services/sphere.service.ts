import { prisma } from '../db/prisma.js';

const MAX_SPHERES = 8;
const normalizeGeneralPrompt = (value: unknown) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, 4000) || null;
};

export const sphereService = {
  list: (userId: string) => prisma.sphere.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
  create: async (userId: string, input: any) => {
    const total = await prisma.sphere.count({ where: { userId } });
    if (total >= MAX_SPHERES) {
      throw new Error(`MAX_SPHERES:${MAX_SPHERES}`);
    }
    return prisma.sphere.create({
      data: {
        name: input.name,
        color: input.color ?? '#60a5fa',
        icon: input.icon,
        generalPrompt: normalizeGeneralPrompt(input.generalPrompt),
        userId
      }
    });
  },
  update: async (id: string, userId: string, input: any) => {
    await prisma.sphere.findFirstOrThrow({ where: { id, userId } });
    return prisma.sphere.update({
      where: { id },
      data: {
        name: input.name,
        color: input.color,
        icon: input.icon,
        generalPrompt: normalizeGeneralPrompt(input.generalPrompt)
      }
    });
  },
  remove: async (id: string, userId: string) => {
    await prisma.task.deleteMany({ where: { sphereId: id, userId } });
    const deleted = await prisma.sphere.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) {
      throw new Error('Sphere not found');
    }
  }
};
