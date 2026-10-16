import { captureProposalBefore, captureProposalAfter, undoStoredProposal } from './ai-task-proposal-undo.service.js';
import { prisma } from '../db/prisma.js';
import { taskAccessWhere } from '../lib/task-access.js';
import { plannerToolsService, type PlannerActionInput } from './planner-tools.service.js';
import type { Prisma } from '@prisma/client';

/**
 * A proposal is a durable, owner-bound command. The model and the browser may
 * suggest actions, but only this service is allowed to commit them.
 */
export type TaskProposalSource = 'planner' | 'telegram_bot' | 'task_chat' | 'telegram_bot_task' | 'legacy_general' | 'telegram_assistant';
export type TaskProposalAction = Record<string, unknown>;
export type TaskProposalView = {
  id: string; status: string; source: string; autoApplied: boolean;
  operations: Array<{ type: string; title: string; before?: string; after?: string; dueDate?: string | null; parentTitle?: string }>;
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
  return ['create_task', 'create_event', 'create_subtask', 'telegram_suggestion'].includes(label(action));
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
  // All existing references must remain reachable by the consenting actor.
  for (const action of actions) {
    for (const id of actionIds(action)) {
      if (!byId.has(id)) throw new Error('Задача или подзадача недоступна. Предложение не создано.');
    }
    if (action.sphereId && typeof action.sphereId === 'string') {
      const sphere = await prisma.sphere.findFirst({ where: { id: action.sphereId, userId }, select: { id: true } });
      if (!sphere) throw new Error('Недоступный сектор.');
    }
  }
  return {
    snapshots: tasks.map(task => ({ id: task.id, updatedAt: task.updatedAt.toISOString() })),
    display: actions.map(action => {
      const target = byId.get(String(action.itemId ?? action.subtaskId ?? action.taskId ?? action.parentTaskId ?? ''));
      return {
        type: label(action),
        title: isCreate(action) ? String(action.title ?? 'Новая задача').slice(0, 180) : target?.title ?? 'Задача',
        before: target ? [target.title, target.dueDate?.toISOString(), target.status].filter(Boolean).join(' · ') : undefined,
        after: afterValue(action) || (['complete', 'complete_subtask', 'complete_task'].includes(label(action)) ? 'Выполнено' : undefined),
        dueDate: typeof action.dueDate === 'string' ? action.dueDate : null,
        parentTitle: action.parentTaskId && target ? target.title : undefined
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
  const { snapshots, display } = input.source === 'telegram_assistant'
    ? { snapshots: [], display: input.actions.map(a => ({ type: 'create_task', title: String(a.title ?? '').slice(0, 180) })) }
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

export async function applyTaskProposal(userId: string, id: string): Promise<TaskProposalView> {
  // Compare-and-swap: a repeated click (or a second replica) cannot replay writes.
  const claimed = await prisma.aiTaskProposal.updateMany({
    where: { id, userId, status: 'PENDING' }, data: { status: 'APPLYING' }
  });
  if (!claimed.count) return getTaskProposal(userId, id);
  const row = await prisma.aiTaskProposal.findFirstOrThrow({ where: { id, userId } });
  const actions = row.operations as TaskProposalAction[];
  try {
    const snapshots = Array.isArray(row.snapshots) ? row.snapshots as Array<{ id: string; updatedAt: string }> : [];
    if (row.source !== 'telegram_assistant') {
      // Recheck access AND optimistic version before writing anything.
      for (const snapshot of snapshots) {
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
    const reports: string[] = [];
    const createdIds: string[] = [];
    if ((row.source === 'planner' || row.source === 'telegram_bot')) {
      const ids = (row.resolvedIds ?? {}) as { items?: string[]; spheres?: string[] };
      for (const action of actions) {
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
    const undoData = await captureProposalAfter(userId, before, createdIds);
    await prisma.aiTaskProposal.update({ where: { id }, data: {
      status: 'APPLIED', undoData: undoData as unknown as Prisma.InputJsonValue,
      result: { reports, createdIds } as Prisma.InputJsonValue
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
