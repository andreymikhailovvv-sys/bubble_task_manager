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
