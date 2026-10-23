import { prisma } from '../db/prisma.js';

/** All monitoring endpoints operate only on personally owned, opted-in roots. */
export async function requireMonitoredTask(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId, parentTaskId: null, collaborationId: null, taskType: 'TASK', aiMonitoringEnabled: true }
  });
  if (!task) throw new Error('Мониторинг этой задачи выключен или задача недоступна.');
  return task;
}

export async function listMonitoringStatuses(userId: string, taskId: string) {
  await requireMonitoredTask(userId, taskId);
  return prisma.taskMonitoringStatus.findMany({ where: { taskId, userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 });
}

export async function addMonitoringStatus(userId: string, taskId: string, label: unknown, detail?: unknown) {
  const task = await requireMonitoredTask(userId, taskId);
  if (typeof label !== 'string' || !label.trim() || label.trim().length > 160 ||
      (detail !== undefined && (typeof detail !== 'string' || detail.length > 2000))) {
    throw new TypeError('Введите короткий статус до 160 символов.');
  }
  return prisma.taskMonitoringStatus.create({
    data: { taskId: task.id, userId, label: label.trim(), detail: typeof detail === 'string' ? detail.trim() || null : null }
  });
}

/** Called after a real user response, not by a model-generated message. */
export async function cancelPendingMonitoringTriggers(userId: string, taskId: string, receivedAt = new Date()) {
  return prisma.taskMonitoringTrigger.updateMany({
    where: { userId, taskId, state: 'pending', updatedAt: { lte: receivedAt } },
    data: { state: 'answered' }
  });
}
