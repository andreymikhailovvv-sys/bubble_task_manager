import type { Prisma } from '@prisma/client';

/**
 * On shared tasks the subtask author's userId does not confer access.
 * Removing a member must immediately block every shared object.
 */
export const taskAccessWhere = (userId: string): Prisma.TaskWhereInput => ({
  OR: [
    { userId, collaborationId: null },
    {
      collaborationId: { not: null },
      collaboration: { members: { some: { userId, isHidden: false } } }
    }
  ]
});
