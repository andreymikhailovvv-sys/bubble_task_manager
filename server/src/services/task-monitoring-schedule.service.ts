import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { signalTaskMonitoringWakeup } from './task-monitoring-wakeup.service.js';

type Db = Prisma.TransactionClient | typeof prisma;
const MONITOR_KIND = 'overdue';
export const MONITORING_INTRO_KIND = 'monitoring_intro';

export const monitoringIntroEventKey = (taskId: string, generation: number) =>
  'monitoring-intro:' + taskId + ':g' + generation;

/** One durable starting conversation per opt-in generation, never per render or edit. */
export async function enqueueMonitoringIntroduction(
  db: Db, task: { id: string; userId: string; aiMonitoringGeneration: number }
) {
  await db.taskMonitoringRun.createMany({
    data: [{
      taskId: task.id, userId: task.userId, sourceTaskId: task.id,
      eventKey: monitoringIntroEventKey(task.id, task.aiMonitoringGeneration),
      kind: MONITORING_INTRO_KIND, state: 'scheduled', dueAt: new Date()
    }],
    skipDuplicates: true
  });
}
const isActive = (row: { status: string; dueDate: Date | null }) =>
  row.status !== 'DONE' && Boolean(row.dueDate);

/**
 * Rebuild the ONE future deadline for this task or subtask. A shared/chat/task
 * update never receives an AI tool merely because a deadline exists.
 * Call inside the same transaction as a task edit whenever possible.
 */
export async function rescheduleMonitoringSource(db: Db, sourceId: string) {
  const source = await db.task.findUnique({
    where: { id: sourceId },
    select: { id: true, userId: true, parentTaskId: true, taskType: true,
      status: true, dueDate: true, title: true, collaborationId: true }
  });
  await db.taskMonitoringRun.updateMany({
    where: { sourceTaskId: sourceId, kind: MONITOR_KIND, state: 'scheduled' },
    data: { state: 'cancelled' }
  });
  if (!source || !isActive(source) || source.taskType !== 'TASK') return;
  const root = source.parentTaskId
    ? await db.task.findUnique({
        where: { id: source.parentTaskId },
        select: { id: true, userId: true, aiMonitoringEnabled: true, aiMonitoringGeneration: true, status: true, collaborationId: true, parentTaskId: true, taskType: true }
      })
    : await db.task.findUnique({
        where: { id: source.id },
        select: { id: true, userId: true, aiMonitoringEnabled: true, aiMonitoringGeneration: true, status: true, collaborationId: true, parentTaskId: true, taskType: true }
      });
  if (!root || !root.aiMonitoringEnabled || root.userId !== source.userId ||
      root.status === 'DONE' || root.collaborationId || root.parentTaskId || root.taskType !== 'TASK' ||
      source.collaborationId) return;

  // On initial opt-in, existing overdue deadlines are discussed collectively
  // by one introduction. Rebuilding the queue on restart/edits must NOT
  // resurrect one overdue AI call per already-overdue subtask.
  const introduction = await db.taskMonitoringRun.findUnique({
    where: { eventKey: monitoringIntroEventKey(root.id, root.aiMonitoringGeneration) },
    select: { createdAt: true }
  });
  if (introduction && source.dueDate!.getTime() <= introduction.createdAt.getTime()) return;

  const eventKey = 'overdue:' + root.id + ':g' + root.aiMonitoringGeneration + ':' + source.id + ':' + source.dueDate!.toISOString();
  // skipDuplicates emits ON CONFLICT DO NOTHING on PostgreSQL and does not
  // poison a surrounding task-edit transaction if the event already exists.
  await db.taskMonitoringRun.createMany({
    data: [{
      taskId: root.id, userId: root.userId, sourceTaskId: source.id,
      eventKey, kind: MONITOR_KIND, dueAt: source.dueDate, state: 'scheduled'
    }],
    skipDuplicates: true
  });
  console.info('[TaskMonitoring] event queued', {
    rootId: root.id, sourceId: source.id,
    generation: root.aiMonitoringGeneration,
    dueAt: source.dueDate!.toISOString()
  });
  // Only cancelled deliveries can be restored. Completed/processing events
  // are never retried at the same timestamp, avoiding duplicate AI charges.
  await db.taskMonitoringRun.updateMany({
    where: { eventKey, state: 'cancelled' },
    data: { state: 'scheduled', dueAt: source.dueDate }
  });
}

export async function rescheduleMonitoringTree(db: Db, rootId: string) {
  const children = await db.task.findMany({
    where: { parentTaskId: rootId },
    select: { id: true }
  });
  await rescheduleMonitoringSource(db, rootId);
  for (const child of children) await rescheduleMonitoringSource(db, child.id);
}

export async function cancelMonitoringSource(db: Db, sourceId: string) {
  await db.taskMonitoringRun.updateMany({
    where: { sourceTaskId: sourceId, kind: MONITOR_KIND, state: 'scheduled' },
    data: { state: 'cancelled' }
  });
}

/** One-time upgrade/restart reconciliation, not a recurring overdue scan. */
export async function recoverMonitoredDeadlinesOnBoot() {
  let cursor: string | undefined;
  for (;;) {
    const roots = await prisma.task.findMany({
      where: { aiMonitoringEnabled: true, parentTaskId: null,
        collaborationId: null, taskType: 'TASK', status: { not: 'DONE' } },
      orderBy: { id: 'asc' }, take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true }
    });
    if (!roots.length) break;
    for (const root of roots) await rescheduleMonitoringTree(prisma, root.id);
    cursor = roots[roots.length - 1]!.id;
    if (roots.length < 100) break;
  }
  console.info('[TaskMonitoring] boot recovery complete');
  signalTaskMonitoringWakeup();
}

/** For legacy bulk and Telegram handlers that write Task rows directly. */
export async function refreshMonitoringAfterExternalWrite(sourceIds: readonly string[]) {
  let changed = false;
  for (const sourceId of new Set(sourceIds)) {
    const source = await prisma.task.findUnique({
      where: { id: sourceId },
      select: { id: true, parentTaskId: true, aiMonitoringEnabled: true }
    });
    if (!source) continue;
    const root = source.parentTaskId
      ? await prisma.task.findUnique({
          where: { id: source.parentTaskId }, select: { aiMonitoringEnabled: true }
        })
      : source;
    if (!root?.aiMonitoringEnabled) continue; // ordinary tasks remain untouched
    await rescheduleMonitoringSource(prisma, sourceId);
    changed = true;
  }
  if (changed) signalTaskMonitoringWakeup();
}
