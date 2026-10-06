import { Prisma, type Prisma as PrismaTypes } from '@prisma/client';
import crypto from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { notifyCollaborativeSubtaskCompleted } from './collaboration-subtask-notification.service.js';

interface TaskInput {
  title?: string;
  description?: string | null;
  sphereId?: string | null;
  parentTaskId?: string | null;
  importance?: number | string;
  urgency?: number | string;
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
  dueDate?: string | Date | null;
  notifyBeforeMinutes?: number | string | null;
  isRecurring?: boolean;
  recurrenceText?: string | null;
  recurrenceJson?: PrismaTypes.InputJsonValue | null;
  recurrenceSummary?: string | null;
  recurrenceUntil?: string | Date | null;
  aiNotificationsEnabled?: boolean;
  taskType?: 'TASK' | 'EVENT';
  location?: string | null;
  collaborationScope?: 'me' | 'all';
}

const toRecurrenceJson = (value: PrismaTypes.InputJsonValue | null | undefined): PrismaTypes.InputJsonValue | PrismaTypes.NullableJsonNullValueInput | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value;
};

interface CreateTaskInput extends TaskInput {
  title: string;
}

const calcScore = (importance: number, urgency: number) => Number((importance * 0.6 + urgency * 0.4).toFixed(2));

const toNumber = (value: number | string, fieldName: 'importance' | 'urgency'): number => {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numericValue)) {
    throw new TypeError(`Invalid ${fieldName} value`);
  }
  return numericValue;
};

const toDueDate = (value: string | Date | null): Date | null => {
  if (value === null) {
    return null;
  }

  const dateValue = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    throw new TypeError('Invalid dueDate value');
  }
  return dateValue;
};

const toNotifyBeforeMinutes = (value: number | string | null): number | null => {
  if (value === null) return null;
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new TypeError('Invalid notifyBeforeMinutes value');
  }
  return Math.round(numericValue);
};

type RecurrenceSchedule = { rrule?: string; timezone?: string; until?: string | null };
const parseRRuleParts = (rrule: string): Record<string, string> => Object.fromEntries(
  rrule
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [key, value] = part.split('=');
      return [key?.toUpperCase() ?? '', value ?? ''];
    })
);
const WEEKDAY_TO_UTC_DAY: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6
};

export const computeNextRecurringDueDate = (schedule: RecurrenceSchedule, baseline: Date): Date | null => {
  if (!schedule.rrule) return null;
  const parts = parseRRuleParts(schedule.rrule);
  const freq = parts.FREQ?.toUpperCase();
  const hour = Number(parts.BYHOUR ?? baseline.getUTCHours());
  const minute = Number(parts.BYMINUTE ?? baseline.getUTCMinutes());
  const step = Math.max(1, Number(parts.INTERVAL ?? 1));
  const until = schedule.until ? new Date(schedule.until) : null;
  const next = new Date(baseline);

  const applyTime = (date: Date) => {
    date.setUTCHours(Number.isFinite(hour) ? hour : 9, Number.isFinite(minute) ? minute : 0, 0, 0);
  };
  applyTime(next);

  if (freq === 'MONTHLY' && parts.BYMONTHDAY) {
    const monthDays = parts.BYMONTHDAY.split(',').map((v) => Number(v)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 31).sort((a, b) => a - b);
    if (monthDays.length === 0) return null;
    for (let i = 0; i < 24; i += 1) {
      const probe = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + i, 1, next.getUTCHours(), next.getUTCMinutes(), 0, 0));
      for (const day of monthDays) {
        const candidate = new Date(Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth(), day, next.getUTCHours(), next.getUTCMinutes(), 0, 0));
        if (candidate.getUTCMonth() !== probe.getUTCMonth()) continue;
        if (candidate > baseline) return until && candidate > until ? null : candidate;
      }
    }
    return null;
  }

  if (freq === 'DAILY') {
    while (next <= baseline) next.setUTCDate(next.getUTCDate() + step);
    return until && next > until ? null : next;
  }
  if (freq === 'WEEKLY') {
    const rawDays = (parts.BYDAY ?? '').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
    const allowedDays = rawDays
      .map((day) => WEEKDAY_TO_UTC_DAY[day])
      .filter((day): day is number => Number.isInteger(day));
    const targetDays = allowedDays.length > 0 ? [...new Set(allowedDays)].sort((a, b) => a - b) : [baseline.getUTCDay()];

    for (let week = 0; week < 104; week += step) {
      const weekStart = new Date(next);
      weekStart.setUTCDate(next.getUTCDate() + (week * 7));
      for (const day of targetDays) {
        const candidate = new Date(weekStart);
        const delta = day - weekStart.getUTCDay();
        candidate.setUTCDate(weekStart.getUTCDate() + delta);
        if (candidate > baseline) return until && candidate > until ? null : candidate;
      }
    }
    return null;
  }
  return null;
};

export const taskService = {
  list: async (userId: string) => {
    const items = await prisma.task.findMany({
      where: { OR: [{ userId }, { collaboration: { members: { some: { userId } } } }] },
      include: { user: { select: { name: true, username: true, email: true } }, collaboration: { include: { members: { include: { user: { select: { name: true, username: true, email: true } } } } } } },
      orderBy: { createdAt: 'desc' }
    });
    const visibleItems = items.filter((task) => !task.collaboration || !task.collaboration.members.find((member) => member.userId === userId)?.isHidden);
    const collaborativeSubtaskIds = visibleItems
      .filter((task) => Boolean(task.parentTaskId && task.collaborationId))
      .map((task) => task.id);
    const commentStats = new Map<string, { total: number; unread: number }>();

    if (collaborativeSubtaskIds.length > 0) {
      const [comments, readStates] = await Promise.all([
        prisma.taskComment.findMany({
          where: { taskId: { in: collaborativeSubtaskIds } },
          select: { taskId: true, userId: true, createdAt: true }
        }),
        prisma.taskCommentReadState.findMany({
          where: { taskId: { in: collaborativeSubtaskIds }, userId },
          select: { taskId: true, lastReadAt: true }
        })
      ]);
      const readAtByTaskId = new Map(readStates.map((state) => [state.taskId, state.lastReadAt]));
      for (const comment of comments) {
        const current = commentStats.get(comment.taskId) ?? { total: 0, unread: 0 };
        current.total += 1;
        const lastReadAt = readAtByTaskId.get(comment.taskId);
        if (comment.userId !== userId && (!lastReadAt || comment.createdAt > lastReadAt)) current.unread += 1;
        commentStats.set(comment.taskId, current);
      }
    }

    return visibleItems.map(({ user, collaboration, ...task }) => {
      const ownMembership = collaboration?.members.find((member) => member.userId === userId);
      const creatorMembership = collaboration?.members.find((member) => member.userId === task.userId);
      const taskCommentStats = commentStats.get(task.id) ?? { total: 0, unread: 0 };
      return ({
      ...task,
      commentCount: taskCommentStats.total,
      unreadCommentCount: taskCommentStats.unread,
      sphereId: !task.parentTaskId && collaboration ? (ownMembership?.sphereId ?? null) : task.sphereId,
      status: !task.parentTaskId && ownMembership?.statusOverride ? ownMembership.statusOverride : task.status,
      ...(!task.parentTaskId && ownMembership ? {
        importance: ownMembership.importance,
        urgency: ownMembership.urgency,
        priorityScore: calcScore(ownMembership.importance, ownMembership.urgency),
        notifyBeforeMinutes: ownMembership.notifyBeforeMinutes,
        aiNotificationsEnabled: ownMembership.aiNotificationsEnabled,
        isRecurring: ownMembership.isRecurring,
        recurrenceText: ownMembership.recurrenceText,
        recurrenceJson: ownMembership.recurrenceJson,
        recurrenceSummary: ownMembership.recurrenceSummary,
        recurrenceUntil: ownMembership.recurrenceUntil
      } : {}),
      creatorName: user.name || user.username || user.email || 'Участник',
      creatorUserId: task.userId,
      creatorColor: creatorMembership?.color ?? '#8b5cf6',
      collaborationColor: ownMembership?.color ?? '#8b5cf6',
      collaborationOwner: Boolean(collaboration && task.userId === userId && !task.parentTaskId),
      collaborationMembers: collaboration && !task.parentTaskId ? collaboration.members.filter((member) => !member.isHidden).map((member) => ({
        userId: member.userId,
        name: member.user.name || member.user.username || member.user.email || 'Участник',
        color: member.color,
        isOwner: member.userId === task.userId
      })) : undefined,
      isCollaborative: Boolean(task.collaborationId)
    });
    });
  },
  create: async (userId: string, input: CreateTaskInput) => {
    const isEvent = input.taskType === 'EVENT';
    const isSubtask = Boolean(input.parentTaskId);
    const importance = toNumber(input.importance ?? 3, 'importance');
    const urgency = toNumber(input.urgency ?? 3, 'urgency');
    const recurrenceSchedule = (!isSubtask && input.recurrenceJson && typeof input.recurrenceJson === 'object'
      ? input.recurrenceJson as unknown as RecurrenceSchedule
      : null);
    const resolvedDueDate = (input.dueDate !== undefined && input.dueDate !== null)
      ? toDueDate(input.dueDate)
      : input.isRecurring && recurrenceSchedule
        ? computeNextRecurringDueDate(recurrenceSchedule, new Date())
        : null;

    const parent = input.parentTaskId ? await prisma.task.findFirst({
      where: { id: input.parentTaskId, OR: [{ userId }, { collaboration: { members: { some: { userId } } } }] },
      select: { collaborationId: true }
    }) : null;
    if (input.parentTaskId && !parent) throw new Error('Parent task not found');
    const created = await prisma.task.create({
      data: {
        title: input.title,
        user: { connect: { id: userId } },
        description: input.description,
        sphere: input.sphereId ? { connect: { id: input.sphereId } } : undefined,
        parentTask: !isEvent && input.parentTaskId ? { connect: { id: input.parentTaskId } } : undefined,
        taskType: isEvent ? 'EVENT' : 'TASK',
        location: isEvent ? (input.location ?? null) : null,
        importance,
        urgency,
        priorityScore: calcScore(importance, urgency),
        status: input.status ?? 'TODO',
        dueDate: resolvedDueDate,
        notifyBeforeMinutes: input.notifyBeforeMinutes !== undefined ? toNotifyBeforeMinutes(input.notifyBeforeMinutes) : 0
        ,
        isRecurring: isSubtask ? false : (input.isRecurring ?? false),
        recurrenceText: isSubtask ? null : (input.recurrenceText ?? null),
        recurrenceJson: isSubtask ? Prisma.JsonNull : toRecurrenceJson(input.recurrenceJson),
        recurrenceSummary: isSubtask ? null : (input.recurrenceSummary ?? null),
        recurrenceUntil: isSubtask ? null : (input.recurrenceUntil !== undefined ? toDueDate(input.recurrenceUntil) : null),
        aiNotificationsEnabled: isEvent ? false : (input.aiNotificationsEnabled ?? true)
        ,
        collaboration: parent?.collaborationId ? { connect: { id: parent.collaborationId } } : undefined
      }
    });
    console.info('[Task] create', { userId, taskId: created.id, parentTaskId: created.parentTaskId, status: created.status, dueDate: created.dueDate?.toISOString() ?? null });
    return created;
  },
  update: async (id: string, userId: string, input: TaskInput) => {
    const currentTask = await prisma.task.findFirstOrThrow({
      where: { id, OR: [{ userId }, { collaboration: { members: { some: { userId } } } }] }
    });
    if (currentTask.collaborationId && input.collaborationScope === 'all' && currentTask.userId !== userId) throw new Error('Only collaboration owner can update everyone');
    const patch: Prisma.TaskUpdateInput = {};
    const isCollaborativeRoot = Boolean(currentTask.collaborationId && !currentTask.parentTaskId);
    const personalSettingsPatch: Prisma.CollaborativeTaskMemberUpdateInput = {};
    const ownMember = isCollaborativeRoot && currentTask.collaborationId
      ? await prisma.collaborativeTaskMember.findUniqueOrThrow({
          where: { collaborationId_userId: { collaborationId: currentTask.collaborationId, userId } }
        })
      : null;
    const sharedDueDateChanged = input.dueDate !== undefined
      && (toDueDate(input.dueDate)?.getTime() ?? null) !== (currentTask.dueDate?.getTime() ?? null);
    const ownStatusChanged = input.status !== undefined
      && input.status !== (ownMember?.statusOverride ?? currentTask.status);
    if (isCollaborativeRoot) {
      if (input.importance !== undefined) personalSettingsPatch.importance = toNumber(input.importance, 'importance');
      if (input.urgency !== undefined) personalSettingsPatch.urgency = toNumber(input.urgency, 'urgency');
      if (input.notifyBeforeMinutes !== undefined) personalSettingsPatch.notifyBeforeMinutes = toNotifyBeforeMinutes(input.notifyBeforeMinutes);
      if (input.aiNotificationsEnabled !== undefined) personalSettingsPatch.aiNotificationsEnabled = Boolean(input.aiNotificationsEnabled);
      if (input.isRecurring !== undefined) personalSettingsPatch.isRecurring = Boolean(input.isRecurring);
      if (input.recurrenceText !== undefined) personalSettingsPatch.recurrenceText = input.recurrenceText;
      if (input.recurrenceJson !== undefined) personalSettingsPatch.recurrenceJson = toRecurrenceJson(input.recurrenceJson);
      if (input.recurrenceSummary !== undefined) personalSettingsPatch.recurrenceSummary = input.recurrenceSummary;
      if (input.recurrenceUntil !== undefined) personalSettingsPatch.recurrenceUntil = toDueDate(input.recurrenceUntil);
      if ((input.notifyBeforeMinutes !== undefined
          && toNotifyBeforeMinutes(input.notifyBeforeMinutes) !== ownMember?.notifyBeforeMinutes)
        || ownStatusChanged || sharedDueDateChanged) {
        personalSettingsPatch.telegramNotifiedAt = null;
      }
      if (input.sphereId) {
        await prisma.sphere.findFirstOrThrow({ where: { id: input.sphereId, userId } });
      }
    }
    if (currentTask.collaborationId && !currentTask.parentTaskId && input.status !== undefined && input.collaborationScope !== 'all') {
      await prisma.collaborativeTaskMember.update({ where: { collaborationId_userId: { collaborationId: currentTask.collaborationId, userId } }, data: { statusOverride: input.status } });
      input = { ...input, status: undefined };
    }
    if (currentTask.collaborationId && !currentTask.parentTaskId && input.status !== undefined && input.collaborationScope === 'all') {
      await prisma.collaborativeTaskMember.updateMany({ where: { collaborationId: currentTask.collaborationId }, data: { statusOverride: input.status } });
    }

    if (input.title !== undefined) {
      patch.title = input.title;
    }
    if (input.description !== undefined) {
      patch.description = input.description;
    }
    if (input.location !== undefined) {
      patch.location = input.location;
    }
    if (input.sphereId !== undefined && (!currentTask.collaborationId || currentTask.parentTaskId)) {
      patch.sphere = input.sphereId ? { connect: { id: input.sphereId } } : { disconnect: true };
    }
    if (input.status !== undefined) {
      patch.status = input.status;
    }
    if (input.parentTaskId !== undefined) {
      patch.parentTask = input.parentTaskId ? { connect: { id: input.parentTaskId } } : { disconnect: true };
    }
    if (!isCollaborativeRoot && input.importance !== undefined) {
      patch.importance = toNumber(input.importance, 'importance');
    }
    if (!isCollaborativeRoot && input.urgency !== undefined) {
      patch.urgency = toNumber(input.urgency, 'urgency');
    }

    if (!isCollaborativeRoot && (input.importance !== undefined || input.urgency !== undefined)) {
      const importance = toNumber(input.importance ?? currentTask.importance, 'importance');
      const urgency = toNumber(input.urgency ?? currentTask.urgency, 'urgency');
      patch.priorityScore = calcScore(importance, urgency);
    }

    if (input.dueDate !== undefined) {
      patch.dueDate = toDueDate(input.dueDate);
    }
    if (!isCollaborativeRoot && input.notifyBeforeMinutes !== undefined) {
      patch.notifyBeforeMinutes = toNotifyBeforeMinutes(input.notifyBeforeMinutes);
    }
    const nextDueDate = input.dueDate !== undefined ? toDueDate(input.dueDate) : currentTask.dueDate;
    const currentDueTime = currentTask.dueDate?.getTime() ?? null;
    const nextDueTime = nextDueDate?.getTime() ?? null;
    const shouldResetTelegramNotification =
      (input.status !== undefined && input.status !== currentTask.status)
      || (input.dueDate !== undefined && nextDueTime !== currentDueTime)
      || (input.notifyBeforeMinutes !== undefined && toNotifyBeforeMinutes(input.notifyBeforeMinutes) !== currentTask.notifyBeforeMinutes);

    if (shouldResetTelegramNotification && !isCollaborativeRoot) {
      patch.telegramNotifiedAt = null;
    }
    if (currentTask.taskType === 'EVENT') {
      if (!isCollaborativeRoot) patch.aiNotificationsEnabled = false;
      patch.parentTask = { disconnect: true };
    } else if (!isCollaborativeRoot && input.aiNotificationsEnabled !== undefined) {
      patch.aiNotificationsEnabled = Boolean(input.aiNotificationsEnabled);
    }

    const isSubtask = Boolean(currentTask.parentTaskId);
    if (!isSubtask && !isCollaborativeRoot) {
      if (input.isRecurring !== undefined) patch.isRecurring = Boolean(input.isRecurring);
      if (input.recurrenceText !== undefined) patch.recurrenceText = input.recurrenceText;
      if (input.recurrenceJson !== undefined) patch.recurrenceJson = toRecurrenceJson(input.recurrenceJson);
      if (input.recurrenceSummary !== undefined) patch.recurrenceSummary = input.recurrenceSummary;
      if (input.recurrenceUntil !== undefined) patch.recurrenceUntil = toDueDate(input.recurrenceUntil);
    } else if (isSubtask && (
      input.isRecurring !== undefined
      || input.recurrenceText !== undefined
      || input.recurrenceJson !== undefined
      || input.recurrenceSummary !== undefined
      || input.recurrenceUntil !== undefined
    )) {
      patch.isRecurring = false;
      patch.recurrenceText = null;
      patch.recurrenceJson = Prisma.JsonNull;
      patch.recurrenceSummary = null;
      patch.recurrenceUntil = null;
    }

    if (!isSubtask && !isCollaborativeRoot && (input.isRecurring === true || input.recurrenceJson !== undefined) && (input.dueDate === undefined || input.dueDate === null)) {
      const schedule = (input.recurrenceJson && typeof input.recurrenceJson === 'object'
        ? input.recurrenceJson as unknown as RecurrenceSchedule
        : currentTask.recurrenceJson as unknown as RecurrenceSchedule | null);
      patch.dueDate = computeNextRecurringDueDate(schedule ?? {}, new Date());
    }

    const shouldNotifyForeignSubtaskCompletion = Boolean(
      currentTask.parentTaskId
      && currentTask.collaborationId
      && currentTask.userId !== userId
      && currentTask.status !== 'DONE'
      && input.status === 'DONE'
    );

    const finalTask = await prisma.$transaction(async (tx) => {
      if (isCollaborativeRoot && currentTask.collaborationId) {
        await tx.collaborativeTaskMember.update({
          where: { collaborationId_userId: { collaborationId: currentTask.collaborationId, userId } },
          data: {
            ...personalSettingsPatch,
            ...(input.sphereId !== undefined ? { sphereId: input.sphereId } : {})
          }
        });
        if (sharedDueDateChanged || (input.status !== undefined && input.collaborationScope === 'all' && ownStatusChanged)) {
          await tx.collaborativeTaskMember.updateMany({
            where: { collaborationId: currentTask.collaborationId },
            data: { telegramNotifiedAt: null }
          });
        }
      }
      const updatedTask = await tx.task.update({ where: { id }, data: patch });
      let finalTask = updatedTask;
      console.info('[Task] update', { userId, taskId: id, beforeStatus: currentTask.status, afterStatus: updatedTask.status, beforeDueDate: currentTask.dueDate?.toISOString() ?? null, afterDueDate: updatedTask.dueDate?.toISOString() ?? null, parentTaskId: currentTask.parentTaskId });

      if (input.status === 'DONE' && updatedTask.isRecurring && !updatedTask.parentTaskId && !isCollaborativeRoot) {
        const schedule = updatedTask.recurrenceJson as unknown as RecurrenceSchedule | null;
        const baseline = updatedTask.dueDate ?? new Date();
        const nextDue = computeNextRecurringDueDate(schedule ?? {}, baseline);
        if (nextDue) {
          finalTask = await tx.task.update({
            where: { id },
            data: { status: 'TODO', dueDate: nextDue, telegramNotifiedAt: null }
          });
        }
      } else if (input.status === 'DONE' && !currentTask.parentTaskId) {
        await tx.task.updateMany({
          where: { parentTaskId: id, status: { not: 'DONE' } },
          data: { status: 'DONE', telegramNotifiedAt: null }
        });
      }

      return finalTask;
    });

    if (shouldNotifyForeignSubtaskCompletion) {
      await notifyCollaborativeSubtaskCompleted({ subtaskId: id, actorUserId: userId });
    }

    if (isCollaborativeRoot && currentTask.collaborationId) {
      const ownSettings = await prisma.collaborativeTaskMember.findUniqueOrThrow({
        where: { collaborationId_userId: { collaborationId: currentTask.collaborationId, userId } }
      });
      return {
        ...finalTask,
        sphereId: ownSettings.sphereId,
        status: ownSettings.statusOverride ?? finalTask.status,
        importance: ownSettings.importance,
        urgency: ownSettings.urgency,
        priorityScore: calcScore(ownSettings.importance, ownSettings.urgency),
        notifyBeforeMinutes: ownSettings.notifyBeforeMinutes,
        aiNotificationsEnabled: ownSettings.aiNotificationsEnabled,
        isRecurring: ownSettings.isRecurring,
        recurrenceText: ownSettings.recurrenceText,
        recurrenceJson: ownSettings.recurrenceJson,
        recurrenceSummary: ownSettings.recurrenceSummary,
        recurrenceUntil: ownSettings.recurrenceUntil
      };
    }
    return finalTask;
  },
  remove: async (id: string, userId: string, scope: 'me' | 'all' = 'me') => {
    const existing = await prisma.task.findFirst({ where: { id, OR: [{ userId }, { collaboration: { members: { some: { userId } } } }] }, select: { id: true, userId: true, parentTaskId: true, status: true, dueDate: true } });
    if (!existing) {
      throw new Error('Task not found');
    }
    if (scope === 'all' && existing.userId !== userId) throw new Error('Only collaboration owner can delete for everyone');
    const taskWithCollaboration = await prisma.task.findUnique({ where: { id }, select: { collaborationId: true, parentTaskId: true } });
    if (taskWithCollaboration?.collaborationId && !taskWithCollaboration.parentTaskId && scope !== 'all') {
      await prisma.collaborativeTaskMember.update({ where: { collaborationId_userId: { collaborationId: taskWithCollaboration.collaborationId, userId } }, data: { isHidden: true } });
    } else {
      await prisma.task.delete({ where: { id } });
    }
    console.info('[Task] remove', { userId, taskId: id, parentTaskId: existing?.parentTaskId ?? null, status: existing?.status ?? null, dueDate: existing?.dueDate?.toISOString() ?? null });
  },
  createShareLink: async (id: string, userId: string) => {
    const task = await prisma.task.findFirstOrThrow({ where: { id, parentTaskId: null, OR: [{ userId }, { collaboration: { members: { some: { userId } } } }] } });
    let collaboration = task.collaborationId ? await prisma.collaborativeTask.findUniqueOrThrow({ where: { id: task.collaborationId } }) : null;
    if (!collaboration) {
      collaboration = await prisma.$transaction(async (tx) => {
        const created = await tx.collaborativeTask.create({ data: { token: crypto.randomBytes(24).toString('base64url'), rootTaskId: task.id } });
        await tx.task.updateMany({ where: { OR: [{ id: task.id }, { parentTaskId: task.id }] }, data: { collaborationId: created.id } });
        await tx.collaborativeTaskMember.create({ data: {
          collaborationId: created.id, userId, sphereId: task.sphereId,
          importance: task.importance, urgency: task.urgency,
          notifyBeforeMinutes: task.notifyBeforeMinutes,
          aiNotificationsEnabled: task.aiNotificationsEnabled,
          isRecurring: task.isRecurring,
          recurrenceText: task.recurrenceText,
          recurrenceJson: task.recurrenceJson ?? Prisma.JsonNull,
          recurrenceSummary: task.recurrenceSummary,
          recurrenceUntil: task.recurrenceUntil
        } });
        return created;
      });
    }
    return { token: collaboration.token };
  },
  sharePreview: async (token: string) => {
    const collaboration = await prisma.collaborativeTask.findUniqueOrThrow({ where: { token }, include: { tasks: { where: { parentTaskId: null }, include: { user: { select: { name: true, username: true } }, _count: { select: { subtasks: true } } } } } });
    const task = collaboration.tasks[0];
    return { title: task.title, description: task.description, subtaskCount: task._count.subtasks, ownerName: task.user.name || task.user.username || 'Пользователь' };
  },
  acceptShare: async (token: string, userId: string, sphereId: string | null) => {
    const collaboration = await prisma.collaborativeTask.findUniqueOrThrow({ where: { token }, include: { tasks: { where: { parentTaskId: null }, select: { id: true } } } });
    if (sphereId) await prisma.sphere.findFirstOrThrow({ where: { id: sphereId, userId } });
    const colors = ['#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#22c55e', '#eab308'];
    const memberCount = await prisma.collaborativeTaskMember.count({ where: { collaborationId: collaboration.id } });
    await prisma.collaborativeTaskMember.upsert({ where: { collaborationId_userId: { collaborationId: collaboration.id, userId } }, create: { collaborationId: collaboration.id, userId, sphereId, color: colors[memberCount % colors.length] }, update: { sphereId, isHidden: false } });
    return { taskId: collaboration.tasks[0].id };
  },
  updateCollaboration: async (id: string, userId: string, color: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new TypeError('Invalid color');
    const task = await prisma.task.findFirstOrThrow({ where: { id, parentTaskId: null, collaboration: { members: { some: { userId } } } }, select: { collaborationId: true } });
    await prisma.collaborativeTaskMember.update({ where: { collaborationId_userId: { collaborationId: task.collaborationId!, userId } }, data: { color } });
    return { color };
  },
  removeCollaborator: async (id: string, ownerId: string, memberUserId: string) => {
    const task = await prisma.task.findFirstOrThrow({
      where: { id, userId: ownerId, parentTaskId: null, collaborationId: { not: null } },
      select: { collaborationId: true }
    });
    if (memberUserId === ownerId) throw new TypeError('Task owner cannot be removed');
    await prisma.collaborativeTaskMember.delete({
      where: { collaborationId_userId: { collaborationId: task.collaborationId!, userId: memberUserId } }
    });
    return { ok: true as const };
  },
  disableCollaboration: async (id: string, userId: string) => {
    const root = await prisma.task.findFirstOrThrow({ where: { id, userId, parentTaskId: null, collaborationId: { not: null } }, include: { subtasks: true, collaboration: { include: { members: true } } } });
    await prisma.$transaction(async (tx) => {
      const ownerMembership = root.collaboration!.members.find((item) => item.userId === userId);
      if (ownerMembership) await tx.task.update({
        where: { id: root.id },
        data: {
          ...(ownerMembership.statusOverride ? { status: ownerMembership.statusOverride } : {}),
          sphereId: ownerMembership.sphereId,
          importance: ownerMembership.importance,
          urgency: ownerMembership.urgency,
          priorityScore: calcScore(ownerMembership.importance, ownerMembership.urgency),
          notifyBeforeMinutes: ownerMembership.notifyBeforeMinutes,
          aiNotificationsEnabled: ownerMembership.aiNotificationsEnabled,
          isRecurring: ownerMembership.isRecurring,
          recurrenceText: ownerMembership.recurrenceText,
          recurrenceJson: ownerMembership.recurrenceJson ?? Prisma.JsonNull,
          recurrenceSummary: ownerMembership.recurrenceSummary,
          recurrenceUntil: ownerMembership.recurrenceUntil,
          telegramNotifiedAt: null
        }
      });
      for (const member of root.collaboration!.members.filter((item) => item.userId !== userId && !item.isHidden)) {
        const clone = await tx.task.create({ data: { title: root.title, description: root.description, userId: member.userId, sphereId: member.sphereId, taskType: root.taskType, location: root.location, importance: member.importance, urgency: member.urgency, priorityScore: calcScore(member.importance, member.urgency), status: member.statusOverride ?? root.status, dueDate: root.dueDate, notifyBeforeMinutes: member.notifyBeforeMinutes, isRecurring: member.isRecurring, recurrenceText: member.recurrenceText, recurrenceJson: member.recurrenceJson ?? Prisma.JsonNull, recurrenceSummary: member.recurrenceSummary, recurrenceUntil: member.recurrenceUntil, aiNotificationsEnabled: member.aiNotificationsEnabled } });
        if (root.subtasks.length) await tx.task.createMany({ data: root.subtasks.map((subtask) => ({ title: subtask.title, description: subtask.description, userId: member.userId, parentTaskId: clone.id, importance: subtask.importance, urgency: subtask.urgency, priorityScore: subtask.priorityScore, status: subtask.status, dueDate: subtask.dueDate, notifyBeforeMinutes: subtask.notifyBeforeMinutes })) });
      }
      await tx.task.updateMany({ where: { collaborationId: root.collaborationId }, data: { collaborationId: null } });
      await tx.collaborativeTask.delete({ where: { id: root.collaborationId! } });
    });
    return { ok: true };
  }
};
