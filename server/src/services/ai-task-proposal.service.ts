import { captureProposalBefore, captureProposalAfter, undoStoredProposal } from './ai-task-proposal-undo.service.js';
import { createHash } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { taskAccessWhere } from '../lib/task-access.js';
import { plannerToolsService, type PlannerActionInput } from './planner-tools.service.js';
import { aiPersonalNotesService, validateAiCreateNoteArgs, validateAiUpdateNoteArgs, type CreatePersonalNoteArgs, type UpdatePersonalNoteArgs } from './ai-create-note.service.js';
import type { Prisma } from '@prisma/client';
import { habitService } from './habit.service.js';
import { validateAiCreateHabitArgs, validateAiHabitDuration, validateAiHabitCompletion, habitDurationLabel, aiHabitDateKey, isExistingHabitAction, type CreateHabitProposalAction } from './ai-create-habit.service.js';
import { taskChipInitial, validateTaskChipValues, chipChanged, applyChipEdits, chipDbPatch, validateChipReferences, type TaskChipValues } from './ai-task-chip-edit.service.js';
import { rescheduleMonitoringSource } from './task-monitoring-schedule.service.js';
import { signalTaskMonitoringWakeup } from './task-monitoring-wakeup.service.js';

/**
 * A proposal is a durable, owner-bound command. The model and the browser may
 * suggest actions, but only this service is allowed to commit them.
 */
export type TaskProposalSource = 'planner' | 'telegram_bot' | 'task_chat' | 'telegram_bot_task' | 'legacy_general' | 'telegram_assistant' | 'daily_checkup' | 'email_assistant';
export type TaskProposalAction = Record<string, unknown>;
export type NoteProposalAction = Record<string, unknown> & UpdatePersonalNoteArgs & { operation: 'update_note'; expectedUpdatedAt: string };
export type CreateNoteProposalAction = Record<string, unknown> & CreatePersonalNoteArgs & { operation: 'create_note' };
function isCreateHabitAction(action: TaskProposalAction): action is CreateHabitProposalAction {
  return action.operation === 'create_habit';
}
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
  operations: Array<{ type: string; title: string; before?: string; after?: string; dueDate?: string | null; parentTitle?: string; details?: string[]; editable?:TaskChipValues }>;
  revision: string;
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
/** Hash the persisted command as well as the clock: PostgreSQL can store two
 * very rapid edits with the same millisecond updatedAt timestamp. */
function taskProposalRevision(row:{
  status:string;updatedAt?:Date;operations?:unknown
}):string{
  return createHash('sha256').update(JSON.stringify({
    status:row.status,updatedAt:row.updatedAt?.toISOString()??null,
    operations:row.operations??null
  })).digest('hex').slice(0,32);
}
export function proposalView(row: {
  id: string; status: string; source: string; autoApplied: boolean; display: unknown; result: unknown; error: string | null;
  operations?:unknown; updatedAt?:Date;
}): TaskProposalView {
  const display=Array.isArray(row.display)?row.display as TaskProposalView['operations']:[];
  const actions=Array.isArray(row.operations)?row.operations as TaskProposalAction[]:[];
  const result=row.result&&typeof row.result==='object'&&!Array.isArray(row.result)
    ?row.result as {selectedIndices?:unknown}:{};
  const selected=Array.isArray(result.selectedIndices)?result.selectedIndices as number[]:null;
  return {
    id: row.id, status: row.status, source: row.source, autoApplied: row.autoApplied,
    revision:taskProposalRevision(row),
    operations:display.map((item,index)=>{
      const localIndex=selected?selected.indexOf(index):index;
      const edited=localIndex<0?undefined:actions[localIndex]?.__chipEdit as TaskChipValues|undefined;
      return {...item,...(item.editable?{editable:{...item.editable,...(edited??{})}}:{})};
    }),
    result: row.result, error: row.error
  };
}

async function ownerSnapshot(userId: string, actions: TaskProposalAction[]) {
  const ids = [...new Set(actions.flatMap(actionIds))];
  const tasks = ids.length ? await prisma.task.findMany({
    where: { id: { in: ids }, AND: [taskAccessWhere(userId)] },
    select: { id: true, title: true, description: true, dueDate: true, status: true, updatedAt: true, parentTaskId: true, sphereId:true, importance:true, urgency:true, notifyBeforeMinutes:true, location:true }
  }) : [];
  const byId = new Map(tasks.map(task => [task.id, task]));
  const createdNoteActions = actions.filter(isCreateNoteAction);
  for (const action of actions.filter(isCreateHabitAction)) validateAiCreateHabitArgs(action);
  const habitActions = actions.filter(isExistingHabitAction);
  const habitIds = [...new Set(habitActions.map(action => action.habitId))];
  const habits = habitIds.length ? await prisma.habit.findMany({
    where: { userId, id: { in: habitIds }, isArchived: false, isAutoCompleted: false },
    select: { id: true, name: true, icon: true, updatedAt: true }
  }) : [];
  const habitsById = new Map(habits.map(habit => [habit.id, habit]));
  for (const action of habitActions) {
    const habit = habitsById.get(action.habitId);
    if (!habit || habit.updatedAt.toISOString() !== action.expectedUpdatedAt) throw new Error('Привычка изменилась или недоступна. Получите её заново.');
    if (action.operation === 'complete_habit') {
      validateAiHabitCompletion(action);
      if (typeof action.dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(action.dateKey)) throw new Error('Некорректная дата выполнения.');
    } else validateAiHabitDuration(action);
  }
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
    if (isNoteAction(action) || isCreateNoteAction(action) || isCreateHabitAction(action) || isExistingHabitAction(action)) continue;
    if (action.operation === 'set_description' && Object.prototype.hasOwnProperty.call(action, 'expectedDescription')) {
      const target = byId.get(String(action.itemId ?? ''));
      if (!target || target.description !== action.expectedDescription) throw new Error('Описание изменилось. Прочитайте его заново.');
      if (typeof action.description !== 'string')
        throw new Error('Некорректное описание.');
    }
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
      ...notes.map(note => ({ kind: 'note', id: note.id, updatedAt: note.updatedAt.toISOString() })),
      ...habits.map(habit => ({ kind: 'habit', id: habit.id, updatedAt: habit.updatedAt.toISOString() }))
    ],
    display: actions.map(action => {
      if (isCreateHabitAction(action)) {
        const habit = validateAiCreateHabitArgs(action);
        const schedule = habit.recurrenceType === 'DAILY' ? 'Ежедневно' :
          habit.recurrenceType === 'INTERVAL' ? 'Каждые ' + habit.intervalDays + ' дн.' :
          'Дни недели: ' + habit.weekdays.join(', ') + ' (0 — воскресенье)';
        return { type: 'create_habit', title: habit.icon + ' ' + habit.name,
          details: [schedule, 'Повторов в день: ' + habit.targetCount,
            'Уведомления: ' + (habit.reminderTimes.join(', ') || 'не заданы'), habitDurationLabel(habit)] };
      }
      if (isExistingHabitAction(action)) {
        const habit = habitsById.get(action.habitId)!;
        const details = action.operation === 'complete_habit'
          ? [action.fullDay ? 'Закрыть дневную норму' : 'Добавить выполнений: ' + validateAiHabitCompletion(action).amount, 'Дата: ' + String(action.dateKey)]
          : [habitDurationLabel(validateAiHabitDuration(action))];
        return { type: action.operation, title: habit.icon + ' ' + habit.name, details };
      }
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
        editable: taskChipInitial(action,target),
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

/** Sector options come from the current account, not guessed by the client. */
export async function taskChipOptions(userId:string){
  return {spheres:await prisma.sphere.findMany({
    where:{userId},orderBy:{createdAt:'asc'},select:{id:true,name:true}
  })};
}

/** Edit exactly one task item, retaining the original AI command and undo
 * record. Old versions are rejected; applied chips never replay their batch. */
export async function editTaskProposal(userId:string,id:string,input:unknown):Promise<TaskProposalView>{
  if(!input||typeof input!=='object'||Array.isArray(input))
    throw new Error('Неверные данные карточки.');
  const data=input as Record<string,unknown>;
  if(!Number.isInteger(data.index)||typeof data.revision!=='string')
    throw new Error('Выберите изменение и актуальную версию карточки.');
  const index=data.index as number;
  const row=await prisma.aiTaskProposal.findFirst({where:{id,userId}});
  if(!row)throw new Error('Предложение не найдено.');
  if(!['PENDING','APPLIED'].includes(row.status))
    throw new Error('Эту карточку больше нельзя менять.');
  if(taskProposalRevision(row)!==data.revision)
    throw new Error('Чип изменился в другом окне. Обновите его.');
  const display=Array.isArray(row.display)?row.display as TaskProposalView['operations']:[];
  const actions=Array.isArray(row.operations)?row.operations as TaskProposalAction[]:[];
  const resultInfo=(row.result&&typeof row.result==='object'&&!Array.isArray(row.result))
    ?row.result as Record<string,unknown>:{};
  const selectedIndices=Array.isArray(resultInfo.selectedIndices)
    ?resultInfo.selectedIndices as number[]:null;
  const storedIndex=selectedIndices?selectedIndices.indexOf(index):index;
  const item=display[index],action=storedIndex<0?undefined:actions[storedIndex];
  if(!item?.editable || !action)throw new Error('Это действие не редактирует задачу.');
  const base=item.editable;
  const current={...base,...(action.__chipEdit as TaskChipValues??{})};
  const next=validateTaskChipValues(data.values,base);
  const patch=chipChanged(current,next);
  await validateChipReferences(userId,patch);
  if(!Object.keys(patch).length)return proposalView(row);
  const nextEdit=chipChanged(base,next);
  const amended=actions.map((op,i)=>i===storedIndex?{
    ...op,...(Object.keys(nextEdit).length?{__chipEdit:nextEdit}:{__chipEdit:undefined})
  }:op);
  // JSON serializes undefined out, so reverting a field removes its override.
  const operations=JSON.parse(JSON.stringify(amended)) as Prisma.InputJsonValue;
  if(row.status==='PENDING'){
    const updated=await prisma.aiTaskProposal.updateMany({
      where:{id,userId,status:'PENDING',updatedAt:row.updatedAt},
      data:{operations,error:null}
    });
    if(updated.count!==1)throw new Error('Карточка изменилась во время редактирования.');
    return getTaskProposal(userId,id);
  }
  const result=(row.result&&typeof row.result==='object'&&!Array.isArray(row.result))
    ?row.result as Record<string,unknown>:{};
  const selected=Array.isArray(result.selectedIndices)?result.selectedIndices as number[]:null;
  const localIndex=selected?selected.indexOf(index):index;
  if(localIndex<0)throw new Error('Эта задача не входила в применённые изменения.');
  const actionTaskIds=Array.isArray(result.actionTaskIds)?result.actionTaskIds as Array<string|null>:[];
  const targetId=actionTaskIds[localIndex]??action.itemId??action.subtaskId??action.taskId;
  if(typeof targetId!=='string')throw new Error('Нельзя установить созданную задачу для этой карточки.');
  const undo=(row.undoData&&typeof row.undoData==='object'&&!Array.isArray(row.undoData))
    ?JSON.parse(JSON.stringify(row.undoData)) as {
      after:Array<{id:string;updatedAt:string}>;
      created:Array<{id:string;updatedAt:string;[key:string]:unknown}>;
    }:null;
  if(!undo)throw new Error('У карточки отсутствует история применения.');
  const observed=[...undo.after,...undo.created].find(item=>item.id===targetId);
  if(!observed)throw new Error('Запись уже недоступна для безопасного редактирования.');
  const updatedProposal=await prisma.$transaction(async tx=>{
    const task=await tx.task.findFirst({
      where:{id:targetId,userId,AND:[taskAccessWhere(userId)]},
      select:{id:true,updatedAt:true,importance:true,urgency:true,status:true,
        dueDate:true,notifyBeforeMinutes:true,collaborationId:true,parentTaskId:true,
        aiMonitoringEnabled:true}
    });
    if(!task||task.updatedAt.toISOString()!==observed.updatedAt)
      throw new Error('Задача изменилась после применения ИИ. Обновите данные.');
    if(task.collaborationId)throw new Error('Совместную задачу изменяйте в окне задачи.');
    if(task.parentTaskId && patch.sphereId!==undefined)
      throw new Error('Сектор подзадачи меняется через родительскую задачу.');
    if(task.aiMonitoringEnabled&&patch.dueDate)
      throw new Error('В режиме мониторинга дата задаётся триггером, а не сроком задачи.');
    const changed=await tx.task.updateMany({
      where:{id:targetId,userId,updatedAt:task.updatedAt},
      data:chipDbPatch(task,patch)
    });
    if(changed.count!==1)throw new Error('Задача изменилась во время сохранения.');
    const updatedTask=await tx.task.findUniqueOrThrow({
      where:{id:targetId},select:{updatedAt:true}
    });
    for(const item of [...undo.after,...undo.created])
      if(item.id===targetId)item.updatedAt=updatedTask.updatedAt.toISOString();
    await rescheduleMonitoringSource(tx,targetId);
    const count=await tx.aiTaskProposal.updateMany({
      where:{id,userId,status:'APPLIED',updatedAt:row.updatedAt},
      data:{operations,undoData:undo as unknown as Prisma.InputJsonValue,error:null}
    });
    if(count.count!==1)throw new Error('Предложение изменилось во время сохранения.');
    return tx.aiTaskProposal.findFirstOrThrow({where:{id,userId}});
  },{isolationLevel:'Serializable'});
  signalTaskMonitoringWakeup();
  return proposalView(updatedProposal);
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
        if (snapshot.kind === 'habit') {
          const habit = await prisma.habit.findFirst({ where: { id: snapshot.id, userId, isArchived:false, isAutoCompleted:false }, select:{updatedAt:true} });
          if (!habit || habit.updatedAt.toISOString() !== snapshot.updatedAt) {
            await prisma.aiTaskProposal.update({ where:{id}, data:{status:'CONFLICT',error:'Привычка изменилась или недоступна. Создайте предложение заново.'} });
            return getTaskProposal(userId,id);
          }
          continue;
        }
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
    const actionTaskIds:(string|null)[]=[];
    const createdNoteIds: string[] = [];
    const createdHabitIds: string[] = [];
    if (row.source === 'planner' || row.source === 'daily_checkup' || row.source === 'telegram_bot' ||
        row.source === 'task_chat' || row.source === 'telegram_bot_task' ||
        (row.source === 'telegram_assistant' && actions.every(a => 'operation' in a)) ||
        (row.source === 'email_assistant' && actions.every(a => 'operation' in a))) {
      if ((row.source === 'telegram_assistant' || row.source === 'email_assistant') && row.autoApplied &&
          actions.some(a => !['create_task', 'create_event', 'create_reminder', 'create_subtask'].includes(String(a.operation)))) {
        throw new Error('Автоматический Telegram-ассистент не может изменять существующие задачи.');
      }
      const ids = (row.resolvedIds ?? {}) as { items?: string[]; spheres?: string[] };
      for (const [actionIndex,action] of actions.entries()) {
        // Task chat can mix its legacy JSON actions (type) with planner tools
        // actions (operation). Dispatch PER ACTION, never by the source of the
        // whole proposal; otherwise operation-only actions reach the legacy
        // handler with action.type=undefined and fail after approval.
        if ((row.source === 'task_chat' || row.source === 'telegram_bot_task') &&
            typeof action.operation !== 'string') {
          const { applyTaskChatProposalActions } = await import('./ai-assistant.service.js');
          const result = await applyTaskChatProposalActions({
            userId, taskId: row.taskId!, actions: [action], userTimeZone: row.userTimeZone
          });
          if (!result.ok) throw new Error(result.error ?? 'Не удалось изменить задачу.');
          reports.push(...result.reports);
          createdIds.push(...result.createdIds);
          actionTaskIds[actionIndex]=result.createdIds.length===1 ? result.createdIds[0]
            : String(action.itemId??action.subtaskId??action.taskId??'')||null;
          if(action.__chipEdit&&actionTaskIds[actionIndex])
            await applyChipEdits(userId,actionTaskIds[actionIndex]!,action.__chipEdit as TaskChipValues);
          continue;
        }
        if (isExistingHabitAction(action)) {
          const current = await prisma.habit.findFirst({ where:{ id:action.habitId, userId, isArchived:false, isAutoCompleted:false } });
          if (!current || current.updatedAt.toISOString() !== action.expectedUpdatedAt) throw new Error('Привычка изменилась или недоступна.');
          if (action.operation === 'complete_habit') {
            const dateKey = String(action.dateKey);
            if (dateKey !== aiHabitDateKey(new Date(), row.userTimeZone)) throw new Error('День изменился. Подготовьте отметку заново.');
            const completion = validateAiHabitCompletion(action);
            const habit = await habitService.complete(action.habitId, userId, { dateKey, amount: completion.amount });
            const progress = habit.stats.find(stat => stat.dateKey === dateKey)?.amount ?? 0;
            reports.push('Привычка «' + habit.name + '»: за день ' + progress + ' из ' + habit.targetCount + '.');
          } else {
            const duration = validateAiHabitDuration(action);
            const habit = await habitService.update(action.habitId, userId, duration);
            reports.push('Изменён срок привычки «' + habit.name + '»: ' + habitDurationLabel(duration) + '.');
          }
          continue;
        }
        if (isCreateHabitAction(action)) {
          const habit = await habitService.create(userId, validateAiCreateHabitArgs(action));
          createdHabitIds.push(habit.id);
          reports.push('Создана привычка «' + habit.name + '».');
          continue;
        }
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
        const affected='itemId' in result&&typeof result.itemId==='string'?result.itemId:null;
        actionTaskIds[actionIndex]=affected;
        if(affected&&isCreate(action))createdIds.push(affected);
        if(affected&&action.__chipEdit)
          await applyChipEdits(userId,affected,action.__chipEdit as TaskChipValues);
      }
    } else if (row.source === 'legacy_general') {
      const { applyLegacyGeneralProposalActions } = await import('./ai-assistant.service.js');
      // Keep exact action order, but execute one at a time so each created
      // ID is linked to its own editable chip, even in a multi-task batch.
      for(const [index,action] of actions.entries()){
        const result=await applyLegacyGeneralProposalActions({
          userId,actions:[action],userTimeZone:row.userTimeZone
        });
        if(!result.ok)throw new Error(result.error??'Не удалось применить изменения.');
        reports.push(...result.reports);
        createdIds.push(...result.createdIds);
        const target=result.createdIds.length===1?result.createdIds[0]:
          typeof action.taskId==='string'?action.taskId:
          typeof action.subtaskId==='string'?action.subtaskId:
          typeof action.itemId==='string'?action.itemId:null;
        actionTaskIds[index]=target;
        if(target&&action.__chipEdit)
          await applyChipEdits(userId,target,action.__chipEdit as TaskChipValues);
      }
    } else if (row.source === 'telegram_assistant') {
      const { approveTelegramAiSuggestedTask } = await import('./telegram-ai-inbox.service.js');
      for (const action of actions) {
        const result = await approveTelegramAiSuggestedTask(userId, String(action.eventId), Number(action.index));
        createdIds.push(result.taskId);
        reports.push('Создана задача «' + String(action.title).slice(0, 180) + '».');
      }
    } else throw new Error('Неизвестный источник предложения.');
    const undoData = await captureProposalAfter(userId, before, createdIds, notesBefore, createdNoteIds, createdHabitIds);
    await prisma.aiTaskProposal.update({ where: { id }, data: {
      status: 'APPLIED', undoData: undoData as unknown as Prisma.InputJsonValue,
      result: { reports, createdIds, actionTaskIds, createdNoteIds, createdHabitIds,
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
  if (current.status === 'APPLIED') {
    if (Array.isArray(current.operations) && (current.operations as TaskProposalAction[]).some(isExistingHabitAction))
      throw new Error('Автоматическая отмена отметок и изменения срока привычки пока не поддерживается. Используйте редактор привычки.');
    await undoStoredProposal(userId, id);
  }
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
