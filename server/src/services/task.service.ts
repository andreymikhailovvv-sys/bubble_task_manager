import { Prisma, type Prisma as PrismaTypes } from '@prisma/client';
import { prisma } from '../db/prisma.js';

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
  if (!Number.isFinite(numericValue) || numericValue < 1) {
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
  list: (userId: string) => prisma.task.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
  create: async (userId: string, input: CreateTaskInput) => {
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

    const created = await prisma.task.create({
      data: {
        title: input.title,
        user: { connect: { id: userId } },
        description: input.description,
        sphere: input.sphereId ? { connect: { id: input.sphereId } } : undefined,
        parentTask: input.parentTaskId ? { connect: { id: input.parentTaskId } } : undefined,
        importance,
        urgency,
        priorityScore: calcScore(importance, urgency),
        status: input.status ?? 'TODO',
        dueDate: resolvedDueDate,
        notifyBeforeMinutes: input.notifyBeforeMinutes !== undefined ? toNotifyBeforeMinutes(input.notifyBeforeMinutes) : 30
        ,
        isRecurring: isSubtask ? false : (input.isRecurring ?? false),
        recurrenceText: isSubtask ? null : (input.recurrenceText ?? null),
        recurrenceJson: isSubtask ? Prisma.JsonNull : toRecurrenceJson(input.recurrenceJson),
        recurrenceSummary: isSubtask ? null : (input.recurrenceSummary ?? null),
        recurrenceUntil: isSubtask ? null : (input.recurrenceUntil !== undefined ? toDueDate(input.recurrenceUntil) : null),
        aiNotificationsEnabled: input.aiNotificationsEnabled ?? true
      }
    });
    console.info('[Task] create', { userId, taskId: created.id, parentTaskId: created.parentTaskId, status: created.status, dueDate: created.dueDate?.toISOString() ?? null });
    return created;
  },
  update: async (id: string, userId: string, input: TaskInput) => {
    const currentTask = await prisma.task.findFirstOrThrow({
      where: { id, userId }
    });
    const patch: Prisma.TaskUpdateInput = {};

    if (input.title !== undefined) {
      patch.title = input.title;
    }
    if (input.description !== undefined) {
      patch.description = input.description;
    }
    if (input.sphereId !== undefined) {
      patch.sphere = input.sphereId ? { connect: { id: input.sphereId } } : { disconnect: true };
    }
    if (input.status !== undefined) {
      patch.status = input.status;
    }
    if (input.parentTaskId !== undefined) {
      patch.parentTask = input.parentTaskId ? { connect: { id: input.parentTaskId } } : { disconnect: true };
    }
    if (input.importance !== undefined) {
      patch.importance = toNumber(input.importance, 'importance');
    }
    if (input.urgency !== undefined) {
      patch.urgency = toNumber(input.urgency, 'urgency');
    }

    if (input.importance !== undefined || input.urgency !== undefined) {
      const importance = toNumber(input.importance ?? currentTask.importance, 'importance');
      const urgency = toNumber(input.urgency ?? currentTask.urgency, 'urgency');
      patch.priorityScore = calcScore(importance, urgency);
    }

    if (input.dueDate !== undefined) {
      patch.dueDate = toDueDate(input.dueDate);
    }
    if (input.notifyBeforeMinutes !== undefined) {
      patch.notifyBeforeMinutes = toNotifyBeforeMinutes(input.notifyBeforeMinutes);
    }
    const nextDueDate = input.dueDate !== undefined ? toDueDate(input.dueDate) : currentTask.dueDate;
    const currentDueTime = currentTask.dueDate?.getTime() ?? null;
    const nextDueTime = nextDueDate?.getTime() ?? null;
    const shouldResetTelegramNotification =
      (input.status !== undefined && input.status !== currentTask.status)
      || (input.dueDate !== undefined && nextDueTime !== currentDueTime)
      || (input.notifyBeforeMinutes !== undefined && toNotifyBeforeMinutes(input.notifyBeforeMinutes) !== currentTask.notifyBeforeMinutes);

    if (shouldResetTelegramNotification) {
      patch.telegramNotifiedAt = null;
    }
    if (input.aiNotificationsEnabled !== undefined) {
      patch.aiNotificationsEnabled = Boolean(input.aiNotificationsEnabled);
    }

    const isSubtask = Boolean(currentTask.parentTaskId);
    if (!isSubtask) {
      if (input.isRecurring !== undefined) patch.isRecurring = Boolean(input.isRecurring);
      if (input.recurrenceText !== undefined) patch.recurrenceText = input.recurrenceText;
      if (input.recurrenceJson !== undefined) patch.recurrenceJson = toRecurrenceJson(input.recurrenceJson);
      if (input.recurrenceSummary !== undefined) patch.recurrenceSummary = input.recurrenceSummary;
      if (input.recurrenceUntil !== undefined) patch.recurrenceUntil = toDueDate(input.recurrenceUntil);
    } else if (
      input.isRecurring !== undefined
      || input.recurrenceText !== undefined
      || input.recurrenceJson !== undefined
      || input.recurrenceSummary !== undefined
      || input.recurrenceUntil !== undefined
    ) {
      patch.isRecurring = false;
      patch.recurrenceText = null;
      patch.recurrenceJson = Prisma.JsonNull;
      patch.recurrenceSummary = null;
      patch.recurrenceUntil = null;
    }

    if (!isSubtask && (input.isRecurring === true || input.recurrenceJson !== undefined) && (input.dueDate === undefined || input.dueDate === null)) {
      const schedule = (input.recurrenceJson && typeof input.recurrenceJson === 'object'
        ? input.recurrenceJson as unknown as RecurrenceSchedule
        : currentTask.recurrenceJson as unknown as RecurrenceSchedule | null);
      patch.dueDate = computeNextRecurringDueDate(schedule ?? {}, new Date());
    }

    return prisma.$transaction(async (tx) => {
      const updatedTask = await tx.task.update({ where: { id }, data: patch });
      let finalTask = updatedTask;
      console.info('[Task] update', { userId, taskId: id, beforeStatus: currentTask.status, afterStatus: updatedTask.status, beforeDueDate: currentTask.dueDate?.toISOString() ?? null, afterDueDate: updatedTask.dueDate?.toISOString() ?? null, parentTaskId: currentTask.parentTaskId });

      if (input.status === 'DONE' && updatedTask.isRecurring && !updatedTask.parentTaskId) {
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
          where: { parentTaskId: id, userId, status: { not: 'DONE' } },
          data: { status: 'DONE', telegramNotifiedAt: null }
        });
      }

      return finalTask;
    });
  },
  remove: async (id: string, userId: string) => {
    const existing = await prisma.task.findFirst({ where: { id, userId }, select: { id: true, parentTaskId: true, status: true, dueDate: true } });
    const deleted = await prisma.task.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) {
      throw new Error('Task not found');
    }
    console.info('[Task] remove', { userId, taskId: id, parentTaskId: existing?.parentTaskId ?? null, status: existing?.status ?? null, dueDate: existing?.dueDate?.toISOString() ?? null });
  }
};
