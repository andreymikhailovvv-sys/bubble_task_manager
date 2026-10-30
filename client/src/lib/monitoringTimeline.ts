import type { Task } from './types';

/**
 * Timeline projections are display-only: a single task may have several
 * independent pending triggers. Never persist these virtual dueDates.
 */
export function projectMonitoringTimeline(tasks: Task[]): Task[] {
  return tasks.flatMap(task => {
    if (!task.aiMonitoringEnabled || task.parentTaskId) return [task];
    return (task.monitoringTriggers ?? []).map(trigger => ({
      ...task,
      dueDate: trigger.dueAt,
      monitoringTriggerId: trigger.id
    }));
  });
}

export function timelineProjectionKey(task: Task): string {
  return task.monitoringTriggerId ? `${task.id}:${task.monitoringTriggerId}` : task.id;
}
