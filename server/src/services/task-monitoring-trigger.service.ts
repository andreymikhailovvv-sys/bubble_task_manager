import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { requireMonitoredTask } from './task-monitoring.service.js';
import { signalTaskMonitoringWakeup } from './task-monitoring-wakeup.service.js';

export const TASK_MONITOR_FOLLOWUP_TOOL = {
  type: 'function' as const,
  name: 'set_task_monitoring_trigger',
  description: 'Schedule or replace ONE follow-up in this monitored task. Use whenever a useful next contact is needed, normally after an assistant reply. MUST honor explicit user reminder dates/relative durations in their timezone (convert to minutes). If no time was given, pick an appropriate interval based on deadline and next action. Skip if task is complete or user declines reminders. Only for enabled beta monitoring.',
  parameters: {
    type: 'object', additionalProperties: false,
    properties: {
      delayMinutes: { type: 'integer', minimum: 5, maximum: 10080, description: 'Minutes to wait for the user response (5 min to 7 days).' },
      question: { type: 'string', description: 'Short question to repeat to the user when the timer expires.' }
    },
    required: ['delayMinutes', 'question']
  },
  strict: false
};

export async function createMonitoringTrigger(userId: string, taskId: string, input: unknown) {
  await requireMonitoredTask(userId, taskId);
  const data = input as Record<string, unknown> | null;
  const delayMinutes = data?.delayMinutes;
  const question = typeof data?.question === 'string' ? data.question.trim() : '';
  if (typeof delayMinutes !== 'number' || !Number.isInteger(delayMinutes) || delayMinutes < 5 || delayMinutes > 10080 ||
      question.length < 4 || question.length > 500) {
    return { ok: false, code: 'INVALID_TRIGGER_ARGUMENTS' };
  }
  // One pending follow-up per task. Answering will cancel it, and new
  // trigger calls replace the pending question/time rather than stack spam.
  const pending = await prisma.taskMonitoringTrigger.findFirst({
    where: { taskId, userId, state: 'pending' }, orderBy: { createdAt: 'desc' }
  });
  const dueAt = new Date(Date.now() + (delayMinutes as number) * 60_000);
  const trigger = pending
    ? await prisma.taskMonitoringTrigger.update({ where: { id: pending.id }, data: { dueAt, question } })
    : await prisma.taskMonitoringTrigger.create({ data: { taskId, userId, dueAt, question } });
  signalTaskMonitoringWakeup();
  return { ok: true, triggerId: trigger.id, dueAt: trigger.dueAt.toISOString(), label: 'Триггер запущен' };
}


/** Safety net when a monitored-task assistant message contains no AI follow-up.
 * The explicit AI/user trigger always wins. One auto follow-up is refreshed
 * after the next AI answer, never stacked beside an existing custom trigger.
 */
export const MONITORING_FALLBACK_DELAY_MS = 3 * 60 * 60 * 1_000;
export const MONITORING_FALLBACK_QUESTION =
  'С последнего сообщения прошло три часа без подтверждённого ответа или прогресса в задаче. Проверь актуальный контекст и кратко напомни пользователю о следующем конкретном действии. Не утверждай, что он ничего не делал вне сервиса.';

export async function ensureMonitoringFallbackTrigger(input: {
  userId: string;
  taskId: string;
  assistantCreatedAt: Date;
}) {
  // Serializable transactions prevent simultaneous assistant completions from
  // each adding a fallback after both observe an empty pending-trigger list.
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

        // If a human answered after this assistant message, do not recreate
        // a reminder which the conversation has already superseded.
        const newerAnswer = await tx.taskAiMessage.findFirst({
          where: {
            taskId: input.taskId, userId: input.userId, role: 'user',
            createdAt: { gt: input.assistantCreatedAt }
          },
          select: { id: true }
        });
        if (newerAnswer) return 'answered' as const;

        const pending = await tx.taskMonitoringTrigger.findFirst({
          where: { taskId: input.taskId, userId: input.userId, state: 'pending' },
          orderBy: { createdAt: 'desc' }
        });
        if (pending && pending.question !== MONITORING_FALLBACK_QUESTION) {
          return 'custom-trigger' as const;
        }

        const dueAt = new Date(Date.now() + MONITORING_FALLBACK_DELAY_MS);
        if (pending) {
          await tx.taskMonitoringTrigger.update({
            where: { id: pending.id }, data: {
              dueAt, question: MONITORING_FALLBACK_QUESTION
            }
          });
          return 'refreshed' as const;
        }
        await tx.taskMonitoringTrigger.create({
          data: {
            taskId: input.taskId, userId: input.userId,
            dueAt, question: MONITORING_FALLBACK_QUESTION
          }
        });
        return 'scheduled' as const;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (result === 'scheduled' || result === 'refreshed') signalTaskMonitoringWakeup();
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) {
        continue;
      }
      throw error;
    }
  }
}

export async function getMonitoringTriggers(userId: string, taskId: string) {
  await requireMonitoredTask(userId, taskId);
  return prisma.taskMonitoringTrigger.findMany({
    where: { taskId, userId, state: 'pending' }, orderBy: { dueAt: 'asc' }, take: 3,
    select: { id: true, dueAt: true, question: true, state: true }
  });
}
