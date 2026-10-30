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
/** No deadline events in monitoring mode. Trigger dueAt is the only scheduled clock.
 * Cancel legacy queued overdue jobs on task changes and boot recovery.
 */
export async function rescheduleMonitoringSource(db: Db, sourceId: string) {
  await db.taskMonitoringRun.updateMany({
    where: { sourceTaskId: sourceId, kind: MONITOR_KIND, state: 'scheduled' },
    data: { state: 'cancelled' }
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
