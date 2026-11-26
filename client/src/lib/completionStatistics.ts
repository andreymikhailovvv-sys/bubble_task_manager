import type { Task } from './types';

export type CompletionScope = 'today' | 'tasks' | 'subtasks';
export type CompletionProgress = { scope: CompletionScope; before: number; after: number; total: number; sequence: number };

export function completionDateKey(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const value = (type: string) => parts.find(part => part.type === type)?.value || '';
    return value('year') + '-' + value('month') + '-' + value('day');
  } catch {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }
}

export function isTodayTask(task: Task, timeZone: string, now: Date): boolean {
  return (task.taskType ?? 'TASK') === 'TASK' && !!task.dueDate
    && Number.isFinite(new Date(task.dueDate).getTime())
    && completionDateKey(new Date(task.dueDate), timeZone) === completionDateKey(now, timeZone);
}

export function completionItems(tasks: Task[], scope: CompletionScope, timeZone: string, now: Date): Task[] {
  return tasks.filter(task => (task.taskType ?? 'TASK') === 'TASK' &&
    (scope === 'today' ? isTodayTask(task, timeZone, now) : scope === 'subtasks' ? !!task.parentTaskId : !task.parentTaskId));
}

export function completionProgress(tasks: Task[], target: Task, timeZone: string, now: Date, sequence: number): CompletionProgress | null {
  const current = tasks.find(task => task.id === target.id);
  if (!current || current.status === 'DONE' || (current.taskType ?? 'TASK') !== 'TASK') return null;
  const scope = isTodayTask(current, timeZone, now) ? 'today' : current.parentTaskId ? 'subtasks' : 'tasks';
  const items = completionItems(tasks, scope, timeZone, now);
  const before = items.filter(task => task.status === 'DONE').length;
  return { scope, before, after: before + 1, total: items.length, sequence };
}
