import { captureProposalBefore, captureProposalAfter, undoStoredProposal } from './ai-task-proposal-undo.service.js';
import { prisma } from '../db/prisma.js';
import { taskAccessWhere } from '../lib/task-access.js';
import { plannerToolsService, type PlannerActionInput } from './planner-tools.service.js';
import { aiPersonalNotesService, validateAiCreateNoteArgs, validateAiUpdateNoteArgs, type CreatePersonalNoteArgs, type UpdatePersonalNoteArgs } from './ai-create-note.service.js';
import type { Prisma } from '@prisma/client';

/**
 * A proposal is a durable, owner-bound command. The model and the browser may
 * suggest actions, but only this service is allowed to commit them.
 */
export type TaskProposalSource = 'planner' | 'telegram_bot' | 'task_chat' | 'telegram_bot_task' | 'legacy_general' | 'telegram_assistant' | 'daily_checkup';
export type TaskProposalAction = Record<string, unknown>;
export type NoteProposalAction = Record<string, unknown> & UpdatePersonalNoteArgs & { operation: 'update_note'; expectedUpdatedAt: string };
export type CreateNoteProposalAction = Record<string, unknown> & CreatePersonalNoteArgs & { operation: 'create_note' };
function isCreateNoteAction(action: TaskProposalAction): action is CreateNoteProposalAction {
  return action.operation === 'create_note';
}
function isNoteAction(action: TaskProposalAction): action is NoteProposalAction {
  return action.operation === 'update_note';
}
function noteActionPayload(action: NoteProposalAction): UpdatePersonalNoteArgs {
  return { id: action.id, title: action.title, content: action.content,
    contentMode: action.contentMode, groupName: action.groupName };
}
export type TaskProposalView = {
  id: string; status: string; source: string; autoApplied: boolean;
  operations: Array<{ type: string; title: string; before?: string; after?: string; dueDate?: string | null; parentTitle?: string; details?: string[] }>;
  result: unknown; error: string | null;
};

function actionIds(action: TaskProposalAction): string[] {
  return ['itemId', 'taskId', 'subtaskId', 'parentTaskId']
    .map(key => action[key]).filter((id): id is string => typeof id === 'string' && id.length > 0);
}
function label(action: TaskProposalAction): string {
  return String(action.operation ?? action.type ?? 'Изменение');
}
function afterValue(action: TaskProposalAction): string {
  return ['title', 'dueDate', 'description', 'status', 'sphereId', 'importance', 'urgency']
    .filter(key => action[key] !== undefined && action[key] !== null)
    .map(key => key + ': ' + String(action[key]).slice(0, 120)).join(' · ').slice(0, 240);
}
function isCreate(action: TaskProposalAction): boolean {
  return ['create_task', 'create_event', 'create_reminder', 'create_subtask', 'telegram_suggestion'].includes(label(action));
}
export function proposalView(row: {
  id: string; status: string; source: string; autoApplied: boolean; display: unknown; result: unknown; error: string | null;
}): TaskProposalView {
  return {
    id: row.id, status: row.status, source: row.source, autoApplied: row.autoApplied,
    operations: Array.isArray(row.display) ? row.display as TaskProposalView['operations'] : [],
    result: row.result, error: row.error
  };
}

async function ownerSnapshot(userId: string, actions: TaskProposalAction[]) {
  const ids = [...new Set(actions.flatMap(actionIds))];
  const tasks = ids.length ? await prisma.task.findMany({
    where: { id: { in: ids }, AND: [taskAccessWhere(userId)] },
    select: { id: true, title: true, description: true, dueDate: true, status: true, updatedAt: true, parentTaskId: true }
  }) : [];
  const byId = new Map(tasks.map(task => [task.id, task]));
  const createdNoteActions = actions.filter(isCreateNoteAction);
  const noteActions = actions.filter(isNoteAction);
  for (const action of createdNoteActions) {
    const payload = validateAiCreateNoteArgs(action);
    if (payload.groupName) {
      const group = await prisma.standaloneNoteGroup.findFirst({
        where: { userId, name: { equals: payload.groupName, mode: 'insensitive' } },
        select: { id: true }
      });
      if (!group) throw new Error('Группа «' + payload.groupName + '» не найдена. Выберите существующую группу.');
    }
  }
  const noteIds = [...new Set(noteActions.map(action => action.id))];
  const notes = noteIds.length ? await prisma.standaloneNote.findMany({
    where: { id: { in: noteIds }, userId },
    select: { id: true, title: true, updatedAt: true }
  }) : [];
  const notesById = new Map(notes.map(note => [note.id, note]));
  for (const action of noteActions) {
    // Validate the exact persisted command and the version the AI actually read.
    validateAiUpdateNoteArgs(noteActionPayload(action));
    const note = notesById.get(action.id);
    if (!note || note.updatedAt.toISOString() !== action.expectedUpdatedAt) {
      throw new Error('Заметка изменилась или недоступна. Прочитайте её снова.');
    }
  }
  const sphereNames = new Map<string, string>();
  // All existing references must remain reachable by the consenting actor.
  for (const action of actions) {
    if (isNoteAction(action) || isCreateNoteAction(action)) continue;
    for (const id of actionIds(action)) {
      if (!byId.has(id)) throw new Error('Задача или подзадача недоступна. Предложение не создано.');
    }
    if (action.sphereId && typeof action.sphereId === 'string') {
      const sphere = await prisma.sphere.findFirst({ where: { id: action.sphereId, userId }, select: { id: true, name: true } });
      if (!sphere) throw new Error('Недоступный сектор.');
      sphereNames.set(sphere.id, sphere.name);
    }
  }
  return {
    snapshots: [
      ...tasks.map(task => ({ id: task.id, updatedAt: task.updatedAt.toISOString() })),
      ...notes.map(note => ({ kind: 'note', id: note.id, updatedAt: note.updatedAt.toISOString() }))
    ],
    display: actions.map(action => {
      if (isCreateNoteAction(action)) return {
        type: 'create_note', title: action.title || 'Без названия',
        details: [
          action.groupName ? 'Группа: ' + action.groupName : 'Без группы',
          action.content ? 'Текст: ' + action.content.replace(/\s+/g, ' ').trim().slice(0, 240) +
            (action.content.length > 240 ? '…' : '') : null
        ].filter((part): part is string => part !== null)
      };
      if (isNoteAction(action)) {
        const note = notesById.get(action.id)!;
        const details = [
          action.title !== null ? 'Новое название: ' + action.title : null,
          action.content !== null ? (action.contentMode === 'append'
            ? 'Добавление текста в конец заметки' : 'Замена содержимого заметки') : null,
          action.content !== null ? 'Текст: ' +
            action.content.replace(/\s+/g, ' ').trim().slice(0, 240) +
            (action.content.length > 240 ? '…' : '') : null,
          action.groupName !== null ? (action.groupName ? 'Группа: ' + action.groupName : 'Убрать из группы') : null
        ].filter((part): part is string => part !== null);
        return { type: 'update_note', title: note.title || 'Без названия', details };
      }
      const target = byId.get(String(action.itemId ?? action.subtaskId ?? action.taskId ?? action.parentTaskId ?? ''));
      return {
        type: label(action),
        title: isCreate(action) ? String(action.title ?? 'Новая задача').slice(0, 180) : target?.title ?? 'Задача',
        before: target ? [target.title, target.dueDate?.toISOString(), target.status].filter(Boolean).join(' · ') : undefined,
        after: afterValue(action) || (['complete', 'complete_subtask', 'complete_task'].includes(label(action)) ? 'Выполнено' : undefined),
        dueDate: typeof action.dueDate === 'string' ? action.dueDate : null,
        parentTitle: action.parentTaskId && target ? target.title : undefined,
        details: isCreate(action) ? [
          typeof action.description === 'string' && action.description.trim()
            ? 'Описание: ' + action.description.trim().slice(0, 180) : null,
          typeof action.sphereId === 'string' && sphereNames.has(action.sphereId)
            ? 'Сектор: ' + sphereNames.get(action.sphereId) : null,
          typeof action.notifyBeforeMinutes === 'number'
            ? 'Уведомление: ' + (action.notifyBeforeMinutes === 0 ? 'в момент события' : 'за ' + action.notifyBeforeMinutes + ' мин.') : null,
          typeof action.location === 'string' && action.location.trim()
            ? 'Место: ' + action.location.trim().slice(0, 120) : null,
          typeof action.importance === 'number' ? 'Важность: ' + action.importance + '/5' : null,
          typeof action.urgency === 'number' ? 'Срочность: ' + action.urgency + '/5' : null
        ].filter((v): v is string => v !== null) : undefined
      };
    })
  };
}

export async function prepareTaskProposal(input: {
  userId: string; requestId: string; source: TaskProposalSource; taskId?: string;
  actions: TaskProposalAction[]; resolvedItemIds?: string[]; resolvedSphereIds?: string[];
  userTimeZone?: string; autoApply?: boolean;
}) {
  if (!input.actions.length || input.actions.length > 100) throw new Error('Некорректное число изменений.');
  const legacyTelegram = input.source === 'telegram_assistant' &&
    input.actions.every(a => label(a) === 'telegram_suggestion');
  const { snapshots, display } = legacyTelegram
    ? { snapshots: [], display: input.actions.map(a => ({
        type: 'create_task', title: String(a.title ?? '').slice(0, 180)
      })) }
    : await ownerSnapshot(input.userId, input.actions);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: input.userId }, select: { aiTaskAutoApply: true }
  });
  const auto = input.autoApply ?? user.aiTaskAutoApply;
  const row = await prisma.aiTaskProposal.upsert({
    where: { userId_requestId: { userId: input.userId, requestId: input.requestId } },
    update: {}, create: {
      userId: input.userId, requestId: input.requestId, source: input.source,
      taskId: input.taskId ?? null, operations: input.actions as unknown as Prisma.InputJsonValue,
      display: JSON.parse(JSON.stringify(display)) as Prisma.InputJsonValue,
      snapshots: snapshots as Prisma.InputJsonValue,
      resolvedIds: { items: input.resolvedItemIds ?? [], spheres: input.resolvedSphereIds ?? [] },
      userTimeZone: input.userTimeZone ?? 'Europe/Moscow', autoApplied: auto
    }
  });
  if (row.status === 'PENDING' && row.autoApplied) return applyTaskProposal(input.userId, row.id);
  return proposalView(row);
}

export async function getTaskProposal(userId: string, id: string) {
  const row = await prisma.aiTaskProposal.findFirst({ where: { id, userId } });
  if (!row) throw new Error('Предложение не найдено.');
  return proposalView(row);
}

export async function rejectTaskProposal(userId: string, id: string) {
  await prisma.aiTaskProposal.updateMany({ where: { id, userId, status: 'PENDING' }, data: { status: 'REJECTED' } });
  return getTaskProposal(userId, id);
}

/**
 * A checkup selection is an index list into the original immutable proposal.
 * Never trust action payloads or task IDs from the browser.
 */
export function validateCheckupSelectedIndices(indices: unknown, length: number): number[] {
  if (!Array.isArray(indices) || indices.length === 0 || indices.length > length ||
      indices.some(value => !Number.isInteger(value) || value < 0 || value >= length) ||
      new Set(indices).size !== indices.length) {
    throw new Error('Выберите хотя бы одно действительное изменение ИИ-чекапа.');
  }
  return [...indices].sort((a: number, b: number) => a - b);
}

export async function applyTaskProposal(userId: string, id: string, selectedIndices?: number[]): Promise<TaskProposalView> {
  // For checkups, the user's explicit selection is mandatory. Persist only the
  // selected commands inside the same atomic PENDING -> APPLYING claim so an
  // old tab, another request or another worker cannot execute a second subset.
  const current = await prisma.aiTaskProposal.findFirst({ where: { id, userId } });
  if (!current) throw new Error('Предложение не найдено.');
  if (current.status !== 'PENDING') return proposalView(current);
  if (current.source !== 'daily_checkup' && selectedIndices !== undefined) {
    throw new Error('Выбор отдельных действий доступен только для ИИ-чекапа.');
  }
  let subset: { actions: TaskProposalAction[]; indices: number[]; originalCount: number;
    snapshots: Array<{ kind?: string; id: string; updatedAt: string }>; ids: { items: string[]; spheres: string[] } } | null = null;
  if (current.source === 'daily_checkup') {
    const originalActions = Array.isArray(current.operations) ? current.operations as TaskProposalAction[] : [];
    const indices = validateCheckupSelectedIndices(selectedIndices, originalActions.length);
    const actions = indices.map(index => originalActions[index]);
    const ids = new Set(actions.flatMap(actionIds));
    const snapshots = (Array.isArray(current.snapshots) ? current.snapshots : [])
      .filter((snapshot): snapshot is { kind?: string; id: string; updatedAt: string } =>
        Boolean(snapshot && typeof snapshot === 'object' && typeof (snapshot as { id?: unknown }).id === 'string'))
      .filter(snapshot => ids.has(snapshot.id));
    subset = { actions, indices, originalCount: originalActions.length, snapshots,
      ids: { items: [...ids], spheres: [] } };
  }
  const claimed = await prisma.aiTaskProposal.updateMany({
    where: { id, userId, status: 'PENDING' },
    data: {
      status: 'APPLYING',
      ...(subset ? {
        operations: subset.actions as unknown as Prisma.InputJsonValue,
        snapshots: subset.snapshots as unknown as Prisma.InputJsonValue,
        resolvedIds: subset.ids as Prisma.InputJsonValue
      } : {})
    }
  });
  if (!claimed.count) return getTaskProposal(userId, id);
  const row = await prisma.aiTaskProposal.findFirstOrThrow({ where: { id, userId } });
  const actions = row.operations as TaskProposalAction[];
  try {
    const snapshots = Array.isArray(row.snapshots) ? row.snapshots as Array<{ kind?: string; id: string; updatedAt: string }> : [];
    if (row.source !== 'telegram_assistant' || actions.some(a => 'operation' in a)) {
      // Recheck access AND optimistic version before writing anything.
      for (const snapshot of snapshots) {
        if (snapshot.kind === 'note') {
          const note = await prisma.standaloneNote.findFirst({
            where: { id: snapshot.id, userId }, select: { updatedAt: true }
          });
          if (!note || note.updatedAt.toISOString() !== snapshot.updatedAt) {
            await prisma.aiTaskProposal.update({ where: { id }, data: {
              status: 'CONFLICT', error: 'Заметка была изменена или недоступна. Создайте предложение заново.'
            } });
            return getTaskProposal(userId, id);
          }
          continue;
        }
        const task = await prisma.task.findFirst({
          where: { id: snapshot.id, AND: [taskAccessWhere(userId)] },
          select: { updatedAt: true }
        });
        if (!task || task.updatedAt.toISOString() !== snapshot.updatedAt) {
          await prisma.aiTaskProposal.update({ where: { id }, data: {
            status: 'CONFLICT', error: 'Задача была изменена или доступ к ней отозван. Сформируйте предложение заново.'
          } });
          return getTaskProposal(userId, id);
        }
      }
    }
    const before = await captureProposalBefore(userId, actions);
    const noteIds = [...new Set(actions.filter(isNoteAction).map(action => action.id))];
    const notesBefore = noteIds.length ? await prisma.standaloneNote.findMany({
      where: { id: { in: noteIds }, userId },
      select: { id: true, title: true, content: true, groupId: true, updatedAt: true }
    }) : [];
    if (notesBefore.length !== noteIds.length) throw new Error('Заметка больше недоступна.');
    const reports: string[] = [];
    const createdIds: string[] = [];
    const createdNoteIds: string[] = [];
    if (row.source === 'planner' || row.source === 'daily_checkup' || row.source === 'telegram_bot' ||
        (row.source === 'telegram_assistant' && actions.every(a => 'operation' in a))) {
      if (row.source === 'telegram_assistant' && row.autoApplied &&
          actions.some(a => !['create_task', 'create_event', 'create_reminder', 'create_subtask'].includes(String(a.operation)))) {
        throw new Error('Автоматический Telegram-ассистент не может изменять существующие задачи.');
      }
      const ids = (row.resolvedIds ?? {}) as { items?: string[]; spheres?: string[] };
      for (const action of actions) {
        if (isCreateNoteAction(action)) {
          const result = await aiPersonalNotesService.create(userId, action);
          if (!result.ok) throw new Error(result.message);
          createdNoteIds.push(result.note.id);
          reports.push('Создана заметка «' + result.note.title + '».');
          continue;
        }
        if (isNoteAction(action)) {
          const result = await aiPersonalNotesService.update(
            userId, noteActionPayload(action), action.expectedUpdatedAt
          );
          if (!result.ok) throw new Error(result.message);
          reports.push('Изменена заметка «' + (result.note?.title ?? 'Без названия') + '».');
          continue;
        }
        const result = await plannerToolsService.action(
          userId, action as PlannerActionInput,
          new Set(ids.items ?? []), new Set(ids.spheres ?? []), row.userTimeZone
        );
        if (!result.ok) throw new Error('message' in result ? String(result.message) : 'Не удалось применить изменение.');
        reports.push('report' in result ? String(result.report) : 'Изменение выполнено.');
        if ('itemId' in result && typeof result.itemId === 'string' && isCreate(action)) createdIds.push(result.itemId);
      }
    } else if (row.source === 'legacy_general') {
      const { applyLegacyGeneralProposalActions } = await import('./ai-assistant.service.js');
      const result = await applyLegacyGeneralProposalActions({
        userId, actions, userTimeZone: row.userTimeZone
      });
      if (!result.ok) throw new Error(result.error ?? 'Не удалось применить изменения.');
      reports.push(...result.reports);
      createdIds.push(...result.createdIds);
    } else if ((row.source === 'task_chat' || row.source === 'telegram_bot_task')) {
      const { applyTaskChatProposalActions } = await import('./ai-assistant.service.js');
      const result = await applyTaskChatProposalActions({
        userId, taskId: row.taskId!, actions, userTimeZone: row.userTimeZone
      });
      if (!result.ok) throw new Error(result.error ?? 'Не удалось изменить задачу.');
      reports.push(...result.reports);
      createdIds.push(...result.createdIds);
    } else if (row.source === 'telegram_assistant') {
      const { approveTelegramAiSuggestedTask } = await import('./telegram-ai-inbox.service.js');
      for (const action of actions) {
        const result = await approveTelegramAiSuggestedTask(userId, String(action.eventId), Number(action.index));
        createdIds.push(result.taskId);
        reports.push('Создана задача «' + String(action.title).slice(0, 180) + '».');
      }
    } else throw new Error('Неизвестный источник предложения.');
    const undoData = await captureProposalAfter(userId, before, createdIds, notesBefore, createdNoteIds);
    await prisma.aiTaskProposal.update({ where: { id }, data: {
      status: 'APPLIED', undoData: undoData as unknown as Prisma.InputJsonValue,
      result: { reports, createdIds, createdNoteIds,
        ...(subset ? { selectedIndices: subset.indices, totalOperations: subset.originalCount } : {}) } as Prisma.InputJsonValue
    } });
  } catch (error) {
    // A failed command must never be retried automatically: the network/database
    // may have committed a prefix of a legacy non-transactional batch.
    await prisma.aiTaskProposal.update({ where: { id }, data: {
      status: 'FAILED', error: error instanceof Error ? error.message.slice(0, 350) : 'Ошибка применения'
    } });
  }
  return getTaskProposal(userId, id);
}

/** One-shot, owner-only reverse operation. Uncertain failures do not apply twice. */
export async function undoTaskProposal(userId: string, id: string): Promise<TaskProposalView> {
  const current = await prisma.aiTaskProposal.findFirst({ where: { id, userId } });
  if (!current) throw new Error('Предложение не найдено.');
  if (current.status === 'APPLIED') await undoStoredProposal(userId, id);
  return getTaskProposal(userId, id);
}

/**
 * Dedicated Telegram "create task" command already creates the task before
 * it returns. Record the successful operation without executing it a second time.
 */
export async function recordAppliedTelegramBotTask(input: {
  userId: string; requestId: string; taskId: string; title: string; dueDate: Date | null;
}) {
  const existing = await prisma.aiTaskProposal.findUnique({
    where: { userId_requestId: { userId: input.userId, requestId: input.requestId } }
  });
  if (existing) return proposalView(existing);
  const undoData = await captureProposalAfter(input.userId, [], [input.taskId]);
  const createdIds = undoData.created.map(item => item.id);
  const row = await prisma.aiTaskProposal.create({
    data: {
      userId: input.userId, requestId: input.requestId, source: 'telegram_bot',
      operations: [{ operation: 'create_task', title: input.title, dueDate: input.dueDate?.toISOString() ?? null }],
      display: [{ type: 'create_task', title: input.title, dueDate: input.dueDate?.toISOString() ?? null }],
      snapshots: [], userTimeZone: 'Europe/Moscow', autoApplied: true, status: 'APPLIED',
      undoData: undoData as unknown as Prisma.InputJsonValue,
      result: { reports: ['Создана задача «' + input.title + '».'], createdIds }
    }
  });
  return proposalView(row);
}
