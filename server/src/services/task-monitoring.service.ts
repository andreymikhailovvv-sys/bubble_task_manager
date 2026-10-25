import { prisma } from '../db/prisma.js';
import { MONITORING_FALLBACK_QUESTION } from './task-monitoring-followup-policy.js';

/** Reading existing statuses is permitted even after monitoring is turned off. */
export async function requireMonitoringOwner(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId, parentTaskId: null, collaborationId: null, taskType: 'TASK' }
  });
  if (!task) throw new Error('Мониторинг этой задачи недоступен.');
  return task;
}

/** Writing and all autonomous AI actions always require active opt-in. */
export async function requireMonitoredTask(userId: string, taskId: string) {
  const task = await requireMonitoringOwner(userId, taskId);
  if (!task.aiMonitoringEnabled) throw new Error('Мониторинг этой задачи выключен.');
  return task;
}

export async function listMonitoringStatuses(userId: string, taskId: string) {
  await requireMonitoringOwner(userId, taskId);
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

/** Human replies supersede only the automatic three-hour fallback.
 * An explicit AI follow-up is a durable scheduled instruction and remains
 * pending until its due time, a replacement, or intentional monitoring opt-out.
 */
export async function cancelPendingMonitoringTriggers(userId: string, taskId: string, receivedAt = new Date()) {
  return prisma.taskMonitoringTrigger.updateMany({
    where: {
      userId, taskId, question: MONITORING_FALLBACK_QUESTION,
      state: { in: ['pending', 'fired'] }, updatedAt: { lte: receivedAt }
    },
    data: { state: 'answered' }
  });
}

/** The unread count is shared by desktop, Telegram Mini App and mobile web. */
export async function getMonitoringStatusUnread(userId: string, taskId: string) {
  const task = await requireMonitoringOwner(userId, taskId);
  const count = await prisma.taskMonitoringStatus.count({
    where: { taskId, userId,
      ...(task.aiMonitoringStatusSeenAt
        ? { createdAt: { gt: task.aiMonitoringStatusSeenAt } }
        : {})
    }
  });
  return { unreadCount: count };
}

export async function markMonitoringStatusesSeen(userId: string, taskId: string) {
  await requireMonitoringOwner(userId, taskId);
  // Advance only up to the last status which exists right now. A later
  // background/AI status is still unread if it arrives after this request.
  const latest = await prisma.taskMonitoringStatus.findFirst({
    where: { taskId, userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { createdAt: true }
  });
  if (latest) await prisma.task.updateMany({
    where: { id: taskId, userId,
      OR: [{ aiMonitoringStatusSeenAt: null }, { aiMonitoringStatusSeenAt: { lt: latest.createdAt } }]
    },
    data: { aiMonitoringStatusSeenAt: latest.createdAt }
  });
  return getMonitoringStatusUnread(userId, taskId);
}
