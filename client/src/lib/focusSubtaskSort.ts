/** Shared newest-first tiebreaker for Focus subtasks on web and Mini App. */
type FocusSortItem = { id: string; createdAt?: string | null; dueDate?: string | null };

export const createdAtTimestamp = (task: FocusSortItem): number => {
  const value = task.createdAt ? Date.parse(task.createdAt) : 0;
  return Number.isFinite(value) ? value : 0;
};

export const dueDateTimestamp = (task: FocusSortItem): number => {
  const value = task.dueDate ? Date.parse(task.dueDate) : Number.POSITIVE_INFINITY;
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
};

export const newestFocusSubtaskFirst = (a: FocusSortItem, b: FocusSortItem): number =>
  createdAtTimestamp(b) - createdAtTimestamp(a) || b.id.localeCompare(a.id);

/** Deadline-bearing items first; equal deadlines and undated items: newest first. */
export const urgentFocusSubtaskFirst = (a: FocusSortItem, b: FocusSortItem): number =>
  dueDateTimestamp(a) - dueDateTimestamp(b) || newestFocusSubtaskFirst(a, b);
