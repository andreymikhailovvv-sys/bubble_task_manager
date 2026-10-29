import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { requireMonitoringOwner } from './task-monitoring.service.js';
import { signalTaskMonitoringWakeup } from './task-monitoring-wakeup.service.js';
import { MONITORING_FALLBACK_DELAY_MS, MONITORING_FALLBACK_QUESTION } from './task-monitoring-followup-policy.js';
export { MONITORING_FALLBACK_DELAY_MS, MONITORING_FALLBACK_QUESTION } from './task-monitoring-followup-policy.js';

export const MAX_TASK_FOLLOWUPS = 3;

export const TASK_MONITOR_FOLLOWUP_TOOL = {
  type: 'function' as const,
  name: 'set_task_monitoring_trigger',
  description: 'Schedule ONE independent one-time reminder or deferred AI action in the task chat, whether autonomous monitoring is on or off. Never replace another pending action. At most 3 pending actions per task. Name it briefly and provide a useful explanation of what you will do. MUST honor explicit user reminder dates/relative durations in their timezone (convert to minutes). In ordinary conversations use only when useful/requested, never automatically after every message. When monitoring is on, keep at least one pending useful follow-up unless completed or the user declined. Do not pretend an external action is performed unless a supported tool actually performs it.',
  parameters: {
    type: 'object', additionalProperties: false,
    properties: {
      delayMinutes: { type: 'integer', minimum: 5, maximum: 10080, description: 'Minutes from now until this one-time action (5 minutes to 7 days).' },
      title: { type: 'string', description: 'Short informative display name, e.g. "Напомнить отправить письмо" (without time or the word trigger).' },
      description: { type: 'string', description: 'One or two concrete sentences explaining the context and what you will do when the time arrives.' },
      question: { type: 'string', description: 'Precise instruction for your future self: what to remind, ask or prepare at the scheduled time. Must be actionable and task-specific.' }
    },
    required: ['delayMinutes', 'title', 'description', 'question']
  },
  strict: false
};

const trim = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export async function createMonitoringTrigger(userId: string, taskId: string, input: unknown) {
  const task = await requireMonitoringOwner(userId, taskId);
  if (task.status === 'DONE') return { ok: false, code: 'TASK_COMPLETED' };
  const data = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const delayMinutes = data.delayMinutes;
  const title = trim(data.title);
  const description = trim(data.description);
  const question = trim(data.question);
  if (typeof delayMinutes !== 'number' || !Number.isInteger(delayMinutes) || delayMinutes < 5 || delayMinutes > 10080 ||
      title.length < 4 || title.length > 85 || description.length < 8 || description.length > 700 ||
      question.length < 4 || question.length > 500) {
    return { ok: false, code: 'INVALID_FOLLOWUP_ARGUMENTS' };
  }

  // The cap must be checked inside a serializable transaction: concurrent
  // requests must never create a fourth pending action or replace another.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await prisma.$transaction(async tx => {
        // An automatic, generic safety-net check-in is not an explicit user
        // instruction. Make room for a named AI action without disturbing
        // any independently scheduled custom reminders.
        await tx.taskMonitoringTrigger.updateMany({
          where: { taskId, userId, state: 'pending', question: MONITORING_FALLBACK_QUESTION },
          data: { state: 'replaced' }
        });
        const pending = await tx.taskMonitoringTrigger.count({
          where: { taskId, userId, state: 'pending' }
        });
        if (pending >= MAX_TASK_FOLLOWUPS) return { ok: false as const, code: 'FOLLOWUP_LIMIT_REACHED', limit: MAX_TASK_FOLLOWUPS };
        const dueAt = new Date(Date.now() + delayMinutes * 60_000);
        const trigger = await tx.taskMonitoringTrigger.create({
          data: { taskId, userId, dueAt, title, description, question }
        });
        return { ok: true as const, triggerId: trigger.id, dueAt: trigger.dueAt.toISOString(), title };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (result.ok) signalTaskMonitoringWakeup();
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue;
      throw error;
    }
  }
  return { ok: false, code: 'FOLLOWUP_CONFLICT' };
}

/** Ensure at least one scheduled follow-up for active monitored tasks.
 * Existing actions retain their own deadlines, even across other AI replies.
 * This safety net does not run in ordinary (non-monitored) task conversations.
 */
export async function ensureMonitoringFallbackTrigger(input: {
  userId: string;
  taskId: string;
  assistantCreatedAt: Date;
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const task = await tx.task.findFirst({
          where: {
            id: input.taskId, userId: input.userId,
            aiMonitoringEnabled: true, parentTaskId: null,
            collaborationId: null, taskType: 'TASK', status: { not: 'DONE' }
          },
          select: { id: true }
        });
        if (!task) return 'inactive' as const;

        const newerAnswer = await tx.taskAiMessage.findFirst({
          where: {
            taskId: input.taskId, userId: input.userId, role: 'user',
            createdAt: { gt: input.assistantCreatedAt }
          },
          select: { id: true }
        });
        if (newerAnswer) return 'answered' as const;

        // Never refresh, move, or cancel any existing pending action, including
        // an earlier fallback. Only a task with zero scheduled actions gets one.
        const pending = await tx.taskMonitoringTrigger.findFirst({
          where: { taskId: input.taskId, userId: input.userId, state: 'pending' },
          select: { id: true, question: true }
        });
        if (pending) return 'already-scheduled' as const;

        const dueAt = new Date(Date.now() + MONITORING_FALLBACK_DELAY_MS);
        await tx.taskMonitoringTrigger.create({
          data: {
            taskId: input.taskId, userId: input.userId, dueAt,
            title: 'Уточнить ход задачи',
            description: 'Свяжусь с пользователем и уточню следующий полезный шаг по этой задаче.',
            question: MONITORING_FALLBACK_QUESTION
          }
        });
        return 'scheduled' as const;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (result === 'scheduled') signalTaskMonitoringWakeup();
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue;
      throw error;
    }
  }
}

export async function getMonitoringTriggers(userId: string, taskId: string) {
  await requireMonitoringOwner(userId, taskId);
  return prisma.taskMonitoringTrigger.findMany({
    where: { taskId, userId, state: 'pending' }, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], take: MAX_TASK_FOLLOWUPS,
    select: { id: true, dueAt: true, title: true, description: true, question: true, state: true }
  });
}
