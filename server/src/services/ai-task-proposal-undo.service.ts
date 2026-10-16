import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { taskAccessWhere } from '../lib/task-access.js';

const fields = {
  id: true, userId: true, parentTaskId: true, collaborationId: true,
  title: true, description: true, location: true, taskType: true, sphereId: true,
  dueDate: true, status: true, importance: true, urgency: true, priorityScore: true,
  notifyBeforeMinutes: true, isRecurring: true, recurrenceText: true,
  recurrenceJson: true, recurrenceSummary: true, recurrenceUntil: true,
  aiNotificationsEnabled: true, updatedAt: true, createdAt: true,
  _count: { select: { attachments: true, comments: true, aiMessages: true, subtasks: true } }
} as const;

type Row = Awaited<ReturnType<typeof loadTasks>>[number];
type Stored = Omit<Row, 'dueDate' | 'recurrenceUntil' | 'createdAt' | 'updatedAt'> & {
  dueDate: string | null; recurrenceUntil: string | null;
  createdAt: string; updatedAt: string;
};
type Reversal = {
  before: Stored[];
  after: Array<{ id: string; updatedAt: string }>;
  created: Array<{ id: string; updatedAt: string }>;
};

async function loadTasks(userId: string, ids: string[]) {
  if (!ids.length) return [];
  return prisma.task.findMany({
    where: { OR: [{ id: { in: ids } }, { parentTaskId: { in: ids } }], AND: [taskAccessWhere(userId)] },
    select: fields
  });
}
function serialize(row: Row): Stored {
  return JSON.parse(JSON.stringify(row)) as Stored;
}
function dateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

export async function captureProposalBefore(userId: string, actions: Array<Record<string, unknown>>) {
  const ids = [...new Set(actions.flatMap(a => ['itemId', 'taskId', 'subtaskId', 'parentTaskId']
    .map(k => a[k]).filter((v): v is string => typeof v === 'string' && v.length > 0)))];
  if (actions.some(a => a.type === 'rebalance_today')) {
    const day = new Date(); day.setHours(0, 0, 0, 0);
    const end = new Date(day); end.setDate(end.getDate() + 1);
    const candidates = await prisma.task.findMany({
      where: { userId, status: { not: 'DONE' }, dueDate: { gte: day, lt: end }, AND: [taskAccessWhere(userId)] },
      select: { id: true }
    });
    ids.push(...candidates.map(t => t.id));
  }
  return (await loadTasks(userId, [...new Set(ids)])).map(serialize);
}

export async function captureProposalAfter(userId: string, before: Stored[], createdIds: string[]): Promise<Reversal> {
  const previouslyKnown = before.map(item => item.id);
  const after = await prisma.task.findMany({
    where: { id: { in: previouslyKnown }, AND: [taskAccessWhere(userId)] },
    select: { id: true, updatedAt: true }
  });
  const created = createdIds.length ? await prisma.task.findMany({
    where: { id: { in: createdIds }, userId, AND: [taskAccessWhere(userId)] },
    select: { id: true, updatedAt: true }
  }) : [];
  // A created parent also owns its freshly created children.
  const createdChildren = createdIds.length ? await prisma.task.findMany({
    where: { parentTaskId: { in: createdIds }, userId, AND: [taskAccessWhere(userId)] },
    select: { id: true, updatedAt: true }
  }) : [];
  return {
    before,
    after: after.map(item => ({ id: item.id, updatedAt: item.updatedAt.toISOString() })),
    created: [...created, ...createdChildren].map(item => ({ id: item.id, updatedAt: item.updatedAt.toISOString() }))
  };
}

export async function undoStoredProposal(userId: string, proposalId: string) {
  const claimed = await prisma.aiTaskProposal.updateMany({
    where: { id: proposalId, userId, status: 'APPLIED' }, data: { status: 'UNDOING' }
  });
  if (!claimed.count) return;
  try {
    await prisma.$transaction(async tx => {
      const proposal = await tx.aiTaskProposal.findFirstOrThrow({
        where: { id: proposalId, userId, status: 'UNDOING' }, select: { undoData: true }
      });
      if (!proposal.undoData) throw new Error('Для этого изменения отсутствует история отмены.');
      const saved = proposal.undoData as unknown as Reversal;
      if (!Array.isArray(saved.before) || !Array.isArray(saved.after) || !Array.isArray(saved.created)) {
        throw new Error('Некорректная история отмены.');
      }
      const current = await tx.task.findMany({
        where: { id: { in: [...saved.after, ...saved.created].map(item => item.id) }, AND: [taskAccessWhere(userId)] },
        select: { id: true, updatedAt: true }
      });
      const currentById = new Map(current.map(item => [item.id, item.updatedAt.toISOString()]));
      for (const row of [...saved.after, ...saved.created]) {
        if (currentById.get(row.id) !== row.updatedAt) {
          throw new Error('Задача изменилась после действия ИИ. Автоматически вернуть её уже небезопасно.');
        }
      }
      const afterIds = new Set(saved.after.map(item => item.id));
      const missing = saved.before.filter(item => !afterIds.has(item.id));
      // Cascade deletions may have removed conversations, files or comments.
      // Never pretend that recreating only the task title would restore those.
      for (const item of missing) {
        if (item._count.attachments || item._count.comments || item._count.aiMessages || item._count.subtasks || item.collaborationId) {
          throw new Error('Удалённая задача содержала связанные данные. Полный безопасный откат недоступен.');
        }
        if (item.userId !== userId) throw new Error('Недостаточно прав для восстановления чужой задачи.');
      }
      // Revert only explicitly tracked changes; first remove newly created children.
      for (const item of [...saved.created].reverse()) {
        const updated = await tx.task.deleteMany({
          where: { id: item.id, userId, updatedAt: new Date(item.updatedAt) }
        });
        if (!updated.count) throw new Error('Не удалось удалить созданную задачу.');
      }
      for (const item of missing) {
        await tx.task.create({
          data: {
            id: item.id, userId, parentTaskId: item.parentTaskId,
            collaborationId: item.collaborationId,
            title: item.title, description: item.description,
            location: item.location, taskType: item.taskType, sphereId: item.sphereId,
            dueDate: dateOrNull(item.dueDate), status: item.status,
            importance: item.importance, urgency: item.urgency, priorityScore: item.priorityScore,
            notifyBeforeMinutes: item.notifyBeforeMinutes,
            isRecurring: item.isRecurring, recurrenceText: item.recurrenceText,
            recurrenceJson: item.recurrenceJson == null ? Prisma.DbNull : item.recurrenceJson as Prisma.InputJsonValue,
            recurrenceSummary: item.recurrenceSummary, recurrenceUntil: dateOrNull(item.recurrenceUntil),
            aiNotificationsEnabled: item.aiNotificationsEnabled,
            createdAt: new Date(item.createdAt)
          }
        });
      }
      for (const item of saved.before.filter(item => afterIds.has(item.id))) {
        const applied = saved.after.find(row => row.id === item.id)!;
        const updated = await tx.task.updateMany({
          where: { id: item.id, updatedAt: new Date(applied.updatedAt), AND: [taskAccessWhere(userId)] },
          data: {
            title: item.title, description: item.description, location: item.location,
            sphereId: item.sphereId, dueDate: dateOrNull(item.dueDate), status: item.status,
            importance: item.importance, urgency: item.urgency, priorityScore: item.priorityScore,
            notifyBeforeMinutes: item.notifyBeforeMinutes,
            isRecurring: item.isRecurring, recurrenceText: item.recurrenceText,
            recurrenceJson: item.recurrenceJson == null ? Prisma.DbNull : item.recurrenceJson as Prisma.InputJsonValue,
            recurrenceSummary: item.recurrenceSummary,
            recurrenceUntil: dateOrNull(item.recurrenceUntil),
            aiNotificationsEnabled: item.aiNotificationsEnabled
          }
        });
        if (!updated.count) throw new Error('Задача изменилась во время отката.');
      }
      await tx.aiTaskProposal.update({ where: { id: proposalId }, data: { status: 'UNDONE', error: null } });
    });
  } catch (err) {
    await prisma.aiTaskProposal.updateMany({
      where: { id: proposalId, userId, status: 'UNDOING' },
      data: { status: 'APPLIED', error: err instanceof Error ? err.message.slice(0, 400) : 'Не удалось вернуть изменения' }
    });
  }
}
