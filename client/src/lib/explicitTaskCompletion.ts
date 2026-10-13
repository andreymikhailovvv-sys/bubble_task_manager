export type CompletionTask = { id: string; parentTaskId?: string | null; status?: string };
export type ConfirmedCompletionPatch = { status: 'DONE'; completeSubtasks?: true };

const isConfirmationRequired = (error: unknown) =>
  Boolean(error && typeof error === 'object' && 'code' in error
    && error.code === 'UNFINISHED_SUBTASKS_REQUIRE_CONFIRMATION');

/**
 * Explicit confirmation is required before a user action can complete unfinished
 * children. A second check happens on the server inside the transaction.
 * Cancelled confirmation does not submit any status update.
 */
export async function completeTaskWithUserConfirmation(
  task: CompletionTask,
  tasks: CompletionTask[],
  update: (patch: ConfirmedCompletionPatch) => Promise<unknown>,
  confirm: (message: string) => boolean,
  beforeRequest?: () => Promise<void>,
  bulkCompletionPossible = true
): Promise<boolean> {
  const unfinished = task.parentTaskId || !bulkCompletionPossible ? 0 : tasks.filter(
    item => item.parentTaskId === task.id && item.status !== 'DONE'
  ).length;
  let completeSubtasks = false;
  if (unfinished > 0) {
    if (!confirm(`У задачи есть ${unfinished} незавершённых подзадач. Завершить их все вместе с основной задачей?`)) return false;
    completeSubtasks = true;
  }
  await beforeRequest?.();
  const payload = (): ConfirmedCompletionPatch => ({
    status: 'DONE',
    ...(completeSubtasks ? { completeSubtasks: true as const } : {})
  });
  try {
    await update(payload());
  } catch (error) {
    // Another user or tab may have added a subtask since local data was read.
    // Even then, never permit an unconfirmed bulk completion.
    if (!completeSubtasks && !task.parentTaskId && bulkCompletionPossible && isConfirmationRequired(error)) {
      if (!confirm('Обнаружены новые незавершённые подзадачи. Завершить все подзадачи вместе с основной задачей?')) return false;
      completeSubtasks = true;
      await update(payload());
    } else {
      throw error;
    }
  }
  return true;
}
