import { Prisma, HabitRecurrenceType } from '@prisma/client';
import { prisma } from '../db/prisma.js';

const DEFAULT_HABIT_COLOR = '#22c55e';
const DEFAULT_HABIT_ICON = '✨';
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const ALLOWED_RECURRENCE_TYPES = new Set<string>(['DAILY', 'INTERVAL', 'WEEKDAYS']);

type HabitInput = {
  name?: string;
  icon?: string | null;
  color?: string | null;
  targetCount?: number | string;
  recurrenceType?: HabitRecurrenceType | string;
  intervalDays?: number | string | null;
  weekdays?: number[] | null;
  reminderTime?: string | null;
  isArchived?: boolean;
};

type CompleteHabitInput = {
  dateKey?: string;
  amount?: number | string;
  completedAt?: string | Date;
};

const normalizeName = (value: unknown, fallback = 'Новая привычка') => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
};

const normalizeIcon = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, 8) : DEFAULT_HABIT_ICON;
};

const normalizeColor = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^#[0-9a-f]{6}$/i.test(text) ? text : DEFAULT_HABIT_COLOR;
};

const normalizeTargetCount = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(99, Math.max(1, Math.round(numeric)));
};

const normalizeIntervalDays = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 2;
  return Math.min(365, Math.max(1, Math.round(numeric)));
};

const normalizeWeekdays = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6))).sort((a, b) => a - b);
};

const normalizeReminderTime = (value: unknown) => {
  if (value === null) return null;
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  return TIME_PATTERN.test(text) ? text : null;
};

const normalizeRecurrenceType = (value: unknown): HabitRecurrenceType => {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return ALLOWED_RECURRENCE_TYPES.has(text) ? text as HabitRecurrenceType : 'DAILY';
};

const normalizeDateKey = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (DATE_KEY_PATTERN.test(text)) return text;
  return new Date().toISOString().slice(0, 10);
};

const toCompletionAmount = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(99, Math.max(1, Math.round(numeric)));
};

const toCompletedAt = (value: unknown) => {
  if (value === undefined || value === null || value === '') return new Date();
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const serializeHabit = async (habit: Awaited<ReturnType<typeof prisma.habit.findFirstOrThrow>>) => {
  const completionStats = await prisma.habitCompletion.groupBy({
    by: ['dateKey'],
    where: { habitId: habit.id, userId: habit.userId },
    _sum: { amount: true },
    _count: { _all: true },
    orderBy: { dateKey: 'desc' },
    take: 120
  });

  return {
    ...habit,
    weekdays: Array.isArray(habit.weekdays) ? habit.weekdays : [],
    stats: completionStats.map((item) => ({
      dateKey: item.dateKey,
      amount: item._sum.amount ?? 0,
      events: item._count._all
    }))
  };
};

export const habitService = {
  list: async (userId: string) => {
    const habits = await prisma.habit.findMany({
      where: { userId, isArchived: false },
      orderBy: [{ createdAt: 'asc' }]
    });
    return Promise.all(habits.map((habit) => serializeHabit(habit)));
  },

  create: async (userId: string, input: HabitInput) => {
    const recurrenceType = normalizeRecurrenceType(input.recurrenceType);
    const habit = await prisma.habit.create({
      data: {
        user: { connect: { id: userId } },
        name: normalizeName(input.name),
        icon: normalizeIcon(input.icon),
        color: normalizeColor(input.color),
        targetCount: normalizeTargetCount(input.targetCount ?? 1),
        recurrenceType,
        intervalDays: recurrenceType === 'INTERVAL' ? normalizeIntervalDays(input.intervalDays ?? 2) : null,
        weekdays: recurrenceType === 'WEEKDAYS' ? normalizeWeekdays(input.weekdays) : [],
        reminderTime: normalizeReminderTime(input.reminderTime)
      }
    });
    return serializeHabit(habit);
  },

  update: async (id: string, userId: string, input: HabitInput) => {
    const current = await prisma.habit.findFirstOrThrow({ where: { id, userId } });
    const recurrenceType = input.recurrenceType !== undefined ? normalizeRecurrenceType(input.recurrenceType) : current.recurrenceType;
    const patch: Prisma.HabitUpdateInput = {};

    if (input.name !== undefined) patch.name = normalizeName(input.name, current.name);
    if (input.icon !== undefined) patch.icon = normalizeIcon(input.icon);
    if (input.color !== undefined) patch.color = normalizeColor(input.color);
    if (input.targetCount !== undefined) patch.targetCount = normalizeTargetCount(input.targetCount);
    if (input.recurrenceType !== undefined) patch.recurrenceType = recurrenceType;
    if (input.intervalDays !== undefined || input.recurrenceType !== undefined) {
      patch.intervalDays = recurrenceType === 'INTERVAL' ? normalizeIntervalDays(input.intervalDays ?? current.intervalDays ?? 2) : null;
    }
    if (input.weekdays !== undefined || input.recurrenceType !== undefined) {
      patch.weekdays = recurrenceType === 'WEEKDAYS' ? normalizeWeekdays(input.weekdays ?? current.weekdays) : [];
    }
    if (input.reminderTime !== undefined) patch.reminderTime = normalizeReminderTime(input.reminderTime);
    if (input.isArchived !== undefined) patch.isArchived = Boolean(input.isArchived);

    const habit = await prisma.habit.update({ where: { id }, data: patch });
    return serializeHabit(habit);
  },

  complete: async (id: string, userId: string, input: CompleteHabitInput) => {
    const habit = await prisma.habit.findFirstOrThrow({ where: { id, userId, isArchived: false } });
    await prisma.habitCompletion.create({
      data: {
        habit: { connect: { id } },
        user: { connect: { id: userId } },
        amount: toCompletionAmount(input.amount ?? 1),
        dateKey: normalizeDateKey(input.dateKey),
        completedAt: toCompletedAt(input.completedAt),
        targetAtCompletion: habit.targetCount,
        recurrenceSnapshot: {
          recurrenceType: habit.recurrenceType,
          intervalDays: habit.intervalDays,
          weekdays: habit.weekdays,
          reminderTime: habit.reminderTime
        }
      }
    });
    return serializeHabit(habit);
  },

  remove: async (id: string, userId: string) => {
    const deleted = await prisma.habit.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) throw new Error('Habit not found');
  }
};
