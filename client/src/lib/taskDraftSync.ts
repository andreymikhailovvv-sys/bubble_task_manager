/**
 * Editor saves must only send fields that the user actually changed.
 * Writing an entire stale draft would undo server-side AI actions when
 * the user closes the task window.
 */
export function changedDraftFields<T extends object>(
  baseline: T,
  draft: T,
  keys: readonly (keyof T)[]
): Partial<T> {
  const patch: Partial<T> = {};
  for (const key of keys) {
    if (JSON.stringify(baseline[key]) !== JSON.stringify(draft[key])) {
      patch[key] = draft[key];
    }
  }
  return patch;
}

/** Keep local unsaved edits, but show fresh server values for clean fields. */
export function mergeRemoteDraftFields<T extends object>(
  baseline: T,
  draft: T,
  remote: T,
  keys: readonly (keyof T)[]
): T {
  const next = { ...draft };
  for (const key of keys) {
    if (JSON.stringify(draft[key]) === JSON.stringify(baseline[key])) {
      next[key] = remote[key];
    }
  }
  return next;
}

/** Only these editable fields may be persisted by the classic web TaskEditor.
 * Never send the entire Task object: it includes stale server/AI-owned fields.
 * Status is deliberately excluded; completion has its own explicit action.
 */
import type { Task } from './types';

export const TASK_EDITOR_EDIT_KEYS = [
  'title', 'description', 'dueDate', 'location', 'sphereId',
  'importance', 'urgency', 'notifyBeforeMinutes',
  'isRecurring', 'recurrenceText', 'recurrenceJson', 'recurrenceSummary', 'recurrenceUntil',
  'aiNotificationsEnabled', 'aiMonitoringEnabled'
] as const satisfies readonly (keyof Task)[];

export function taskEditorEditableSnapshot(task: Partial<Task>): Partial<Task> {
  const snapshot: Partial<Task> = {};
  for (const key of TASK_EDITOR_EDIT_KEYS) {
    // A missing key must never be interpreted as an instruction to erase it.
    if (task[key] !== undefined) (snapshot as Record<string, unknown>)[key] = task[key];
  }
  return snapshot;
}

export function taskEditorChangedFields(baseline: Partial<Task>, draft: Partial<Task>): Partial<Task> {
  const patch = changedDraftFields(baseline, taskEditorEditableSnapshot(draft), TASK_EDITOR_EDIT_KEYS);
  // Only explicit editable values are valid PATCH fields.
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<Task>;
}
