/** Compact, verified task-change receipt for responses sent by the Telegram bot. */
type TaskChange = {
  type: string; title: string; after?: string; dueDate?: string | null;
};
type TaskReceipt = {
  status: string;
  operations: TaskChange[];
  error?: string | null;
} | null | undefined;

const formattedDate = (iso?: string | null, timeZone = 'Europe/Moscow'): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleString('ru-RU', {
      timeZone, day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return date.toLocaleString('ru-RU');
  }
};

const newTitleFromAfter = (after?: string): string | null => {
  const value = after?.match(/(?:^| · )title: ([^·]+)/)?.[1]?.trim();
  return value?.slice(0, 180) || null;
};

export function formatTelegramTaskChanges(proposal: TaskReceipt, timeZone?: string): string[] {
  if (!proposal) return [];
  if (proposal.status !== 'APPLIED') {
    return proposal.status === 'FAILED' || proposal.status === 'CONFLICT'
      ? ['⚠️ Изменения задач не применены' + (proposal.error ? ': ' + proposal.error : '.')]
      : [];
  }
  const rows = proposal.operations.slice(0, 20).map(action => {
    const name = '«' + action.title + '»';
    const date = formattedDate(action.dueDate, timeZone);
    switch (action.type) {
      case 'create_reminder': return 'Создал напоминание ' + name + (date ? ', на ' + date : '');
      case 'create_task': return 'Создал задачу ' + name + (date ? ', срок ' + date : '');
      case 'create_event': return 'Создал событие ' + name + (date ? ', начало ' + date : '');
      case 'create_subtask': return 'Добавил подзадачу ' + name + (date ? ', срок ' + date : '');
      case 'telegram_suggestion': return 'Создал задачу ' + name;
      case 'reschedule':
      case 'reschedule_task':
      case 'reschedule_subtask': return 'Перенёс ' + name + (date ? ' на ' + date : '');
      case 'clear_due_date': return 'Убрал срок у ' + name;
      case 'complete':
      case 'complete_task':
      case 'complete_subtask': return 'Отметил выполненным ' + name;
      case 'reopen':
      case 'reopen_task':
      case 'reopen_subtask': return 'Вернул в работу ' + name;
      case 'rename':
      case 'rename_task':
      case 'rename_subtask': return 'Переименовал ' + name +
        (newTitleFromAfter(action.after) ? ' в «' + newTitleFromAfter(action.after) + '»' : '');
      case 'delete':
      case 'delete_task':
      case 'delete_subtask': return 'Удалил ' + name;
      case 'set_priority': return 'Изменил приоритет ' + name;
      case 'change_sphere':
      case 'change_task_sphere': return 'Изменил сектор ' + name;
      case 'set_notification': return 'Обновил уведомление ' + name;
      case 'set_description': return 'Изменил описание ' + name;
      case 'update_task':
      case 'update_subtask': {
        const fields = action.after ?? '';
        const changes: string[] = [];
        const newName = newTitleFromAfter(fields);
        if (newName) changes.push('название на «' + newName + '»');
        if (/description:/.test(fields)) changes.push('описание');
        if (/dueDate:/.test(fields)) changes.push('срок');
        if (/importance:|urgency:/.test(fields)) changes.push('приоритет');
        if (/notifyBeforeMinutes:/.test(fields)) changes.push('напоминания');
        return 'Обновил ' + name + (changes.length ? ': ' + changes.join(', ') : '');
      }
      case 'rebalance_today': return 'Перераспределил запланированные задачи на сегодня';
      default: return 'Изменил ' + name;
    }
  });
  if (proposal.operations.length > rows.length) {
    rows.push('И ещё ' + (proposal.operations.length - rows.length) + ' изменений');
  }
  return rows;
}
