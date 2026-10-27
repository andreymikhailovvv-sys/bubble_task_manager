import { plannerToolsService, PLANNER_OPERATIONS, PLANNER_BATCH_OPERATIONS, type PlannerActionInput, type PlannerBatchActionInput, type PlannerSearchInput, type PlannerListInput } from './planner-tools.service.js';
import { personalNotesToolsService, mergeTaskAndNoteSearchResults, validateNoteSearchInput } from './personal-notes-tools.service.js';
import { validateAiCreateNoteArgs, validateAiUpdateNoteArgs } from './ai-create-note.service.js';
import { normalizePlannerDueDate } from './planner-due-date.service.js';
import { requireMonitoredTask } from './task-monitoring.service.js';

export const TASK_CHAT_WORKSPACE_TOOL_NAMES = [
  'search_workspace', 'search_notes', 'read_note', 'create_note', 'update_note',
  'search_tasks', 'list_tasks', 'get_task', 'list_sectors', 'task_action', 'task_actions'
] as const;

const MAX_ACTIONS = 100;

/**
 * Both interactive task chat and opt-in background monitoring use the same
 * authenticated planner and personal-notes adapters as the general assistant.
 * Writes are staged in ONE owner-scoped proposal; background monitoring may
 * auto-apply that proposal only after the owning task is checked again.
 */
export function createTaskChatWorkspaceTools(input: {
  userId: string; taskId: string; userTimeZone: string;
  autonomousMonitoring: boolean; now?: Date;
}) {
  const resolvedNoteIds = new Set<string>();
  const readNoteVersions = new Map<string, string>();
  const resolvedItemIds = new Set<string>();
  const resolvedSphereIds = new Set<string>();
  const noteUpdates = new Set<string>();
  const actions: Record<string, unknown>[] = [];
  const now = input.now ?? new Date();

  const execute = async (name: string, value: unknown): Promise<unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return { ok: false, code: 'INVALID_ARGUMENTS' };
    const args = value as Record<string, unknown>;
    try {
      if (name === 'search_workspace' || name === 'search_notes') {
        const query = validateNoteSearchInput(args);
        const notes = await personalNotesToolsService.search(input.userId, query);
        notes.results.forEach(note => resolvedNoteIds.add(note.id));
        if (name === 'search_notes') return notes;
        const tasks = await plannerToolsService.search(input.userId, {
          queries: query.queries, keywords: query.keywords, sphereHints: [],
          itemType: 'any', statusScope: 'all', dueFrom: null, dueTo: null, limit: query.limit
        });
        tasks.results.forEach(item => resolvedItemIds.add(item.id));
        return mergeTaskAndNoteSearchResults(tasks, notes, query.limit);
      }
      if (name === 'read_note') {
        if (typeof args.id !== 'string' || !resolvedNoteIds.has(args.id))
          return { ok: false, code: 'NOTE_NOT_RESOLVED', message: 'Сначала найди заметку.' };
        const note = await personalNotesToolsService.read(input.userId, args.id);
        if (!note) return { ok: false, code: 'NOTE_NOT_FOUND' };
        readNoteVersions.set(args.id, note.updatedAt);
        return { ok: true, note };
      }
      if (name === 'create_note' || name === 'update_note') {
        if (actions.length >= MAX_ACTIONS) return { ok: false, code: 'TOO_MANY_ACTIONS' };
        if (input.autonomousMonitoring) await requireMonitoredTask(input.userId, input.taskId);
        if (name === 'create_note') {
          if (actions.some(item => item.operation === 'create_note'))
            return { ok: false, code: 'NOTE_ALREADY_PREPARED' };
          const note = validateAiCreateNoteArgs(args);
          actions.push({ operation: 'create_note', ...note });
        } else {
          const note = validateAiUpdateNoteArgs(args);
          const expectedUpdatedAt = readNoteVersions.get(note.id);
          if (!expectedUpdatedAt || noteUpdates.has(note.id))
            return { ok: false, code: 'NOTE_NOT_READ', message: 'Сначала найди и прочитай заметку, затем внеси изменение один раз.' };
          actions.push({ operation: 'update_note', ...note, expectedUpdatedAt });
          noteUpdates.add(note.id);
        }
        return { ok: true, status: 'prepared', message: input.autonomousMonitoring
          ? 'Изменение подготовлено к автоматическому применению в конце этого обращения.'
          : 'Изменение подготовлено, будет показано в карточке подтверждения.' };
      }
      if (name === 'search_tasks') {
        const found = await plannerToolsService.search(input.userId, args as PlannerSearchInput);
        found.results.forEach(item => resolvedItemIds.add(item.id));
        return found;
      }
      if (name === 'list_tasks') {
        const result = await plannerToolsService.list(input.userId, args as PlannerListInput);
        result.items.forEach((item: { id: string }) => resolvedItemIds.add(item.id));
        return result;
      }
      if (name === 'get_task') {
        if (typeof args.id !== 'string') return { ok: false, code: 'INVALID_ID' };
        const item = await plannerToolsService.getItem(input.userId, args.id);
        if (!item) return { ok: false, code: 'ITEM_NOT_FOUND' };
        resolvedItemIds.add(item.id);
        return { ok: true, item };
      }
      if (name === 'list_sectors') {
        const sectors = await plannerToolsService.listSpheres(input.userId);
        sectors.forEach((sector: { id: string }) => resolvedSphereIds.add(sector.id));
        return sectors;
      }
      if (name === 'task_action' || name === 'task_actions') {
        if (input.autonomousMonitoring) await requireMonitoredTask(input.userId, input.taskId);
        const batch: PlannerActionInput[] = name === 'task_action'
          ? [{
              ...args,
              dueDate: normalizePlannerDueDate(args.dueDate as string | null, input.userTimeZone, now)
            } as PlannerActionInput]
          : (args as unknown as PlannerBatchActionInput).actions?.map(action => ({
              ...action,
              dueDate: normalizePlannerDueDate(action.dueDate, input.userTimeZone, now),
              parentTaskId: null, title: null, description: null, location: null
            } as PlannerActionInput)) ?? [];
        if (!batch.length || batch.length + actions.length > MAX_ACTIONS ||
            batch.some(action => name === 'task_action'
              ? !PLANNER_OPERATIONS.includes(action.operation)
              : !PLANNER_BATCH_OPERATIONS.includes(action.operation as typeof PLANNER_BATCH_OPERATIONS[number])))
          return { ok: false, code: 'INVALID_TASK_ACTION' };
        actions.push(...batch.map(action => ({ ...action })));
        return { ok: true, status: 'prepared', requestedCount: batch.length, message: input.autonomousMonitoring
          ? 'Операция подготовлена к автоприменению с проверкой прав и актуальности данных.'
          : 'Операция будет показана для подтверждения.' };
      }
      return { ok: false, code: 'UNKNOWN_TOOL' };
    } catch (error) {
      return { ok: false, code: 'WORKSPACE_TOOL_FAILED',
        message: error instanceof Error ? error.message.slice(0, 300) : 'Не удалось выполнить операцию' };
    }
  };

  return { execute, actions, resolvedItemIds, resolvedSphereIds };
}
