import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { aiAssistantService } from './ai-assistant.service.js';
import { requireMonitoredTask } from './task-monitoring.service.js';
import { publishTaskMonitoringReply } from './task-monitoring-delivery.service.js';
import { recoverMonitoredDeadlinesOnBoot } from './task-monitoring-schedule.service.js';
import { registerTaskMonitoringWakeup } from './task-monitoring-wakeup.service.js';

const MAX_AUTOMATIC_TASK_CALLS_PER_TICK = 8;
const RECOVERY_INTERVAL_MS = 60_000;
const MAX_LOCAL_TIMER_MS = 30 * 60_000;
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let timerRevision = 0;

type Run = { id: string; userId: string; taskId: string };
async function markRun(id: string, state: string) {
  await prisma.taskMonitoringRun.update({ where: { id }, data: { state } });
}

async function deadlineStillCurrent(taskId: string, sourceId: string, dueAt: Date) {
  const item = await prisma.task.findUnique({
    where: { id: sourceId }, select: { id: true, parentTaskId: true, status: true, dueDate: true, title: true, taskType: true, collaborationId: true }
  });
  if (!item || item.status === 'DONE' || item.taskType !== 'TASK' || item.collaborationId ||
      !item.dueDate || item.dueDate.getTime() !== dueAt.getTime() ||
      (item.id !== taskId && item.parentTaskId !== taskId)) return null;
  return item;
}

/** Exactly one worker owns the delivery attempt. No implicit retry of paid AI calls. */
async function deliver(run: Run, question: string, checkCurrent: () => Promise<boolean>) {
  console.info('[TaskMonitoring] AI delivery starting', { runId: run.id, taskId: run.taskId });
  try {
    await requireMonitoredTask(run.userId, run.taskId);
    if (!await checkCurrent()) { await markRun(run.id, 'cancelled'); return; }
    const history = await aiAssistantService.listTaskDialogForContext({
      userId: run.userId, taskId: run.taskId
    });
    const statuses = await prisma.taskMonitoringStatus.findMany({
      where: { userId: run.userId, taskId: run.taskId },
      orderBy: { createdAt: 'desc' }, take: 8,
      select: { label: true, createdAt: true }
    });
    const result = await aiAssistantService.askTaskAssistant({
      userId: run.userId, taskId: run.taskId, history,
      question: [
        'Это автоматический запрос сервера в рамках ВКЛЮЧЁННОГО beta-мониторинга задачи.',
        question, 'История статусов:',
        statuses.map(item => item.createdAt.toISOString() + ': ' + item.label).join('\n') || 'Статусов ещё нет.',
        'Если можешь сделать полезную часть работы сейчас, сделай и пришли результат.',
        'Если не хватает данных, задай конкретные вопросы и используй set_task_monitoring_trigger.',
        'Если действие зависит от пользователя, уточни, выполнено ли оно, и используй триггер.',
        'Не заявляй о внешних действиях без подтверждения.'
      ].join('\n'),
      mode: 'fast', billingMode: 'dynamic', billingFeature: 'overdue_nudge'
    });
    // User can disable monitoring, finish or reschedule the source deadline,
    // or answer a follow-up while the model call is still in progress.
    await requireMonitoredTask(run.userId, run.taskId);
    if (!await checkCurrent()) { await markRun(run.id, 'cancelled'); return; }
    await aiAssistantService.appendTaskDialogAssistantMessage({
      userId: run.userId, taskId: run.taskId,
      content: result.answer, creditsSpentMilli: result.billing.creditsSpentMilli
    });
    // At this point the task conversation is the source of truth.
    // The fan-out uses an idempotent event key so a network retry never
    // publishes a duplicate quick-chat message or notification.
    await publishTaskMonitoringReply({
      userId: run.userId, taskId: run.taskId, runId: run.id,
      kind: question.startsWith('Пользователь пока не ответил') ? 'trigger' : 'overdue',
      answer: result.answer
    });
    await markRun(run.id, 'completed');
    console.info('[TaskMonitoring] AI delivery completed', { runId: run.id, taskId: run.taskId });
  } catch (error) {
    await markRun(run.id, 'failed');
    console.error('[TaskMonitoring] automatic request failed', {
      taskId: run.taskId, runId: run.id,
      reason: error instanceof Error ? error.message : 'unknown'
    });
  }
}

/** Only reads due, already-scheduled queue rows. Never scans tasks every minute. */
export async function pollTaskMonitoring(now = new Date()) {
  if (running) return;
  running = true;
  try {
    let remaining = MAX_AUTOMATIC_TASK_CALLS_PER_TICK;
    const triggers = await prisma.taskMonitoringTrigger.findMany({
      where: {
        state: 'pending', dueAt: { lte: now },
        task: { aiMonitoringEnabled: true, parentTaskId: null,
          collaborationId: null, taskType: 'TASK', status: { not: 'DONE' } }
      },
      orderBy: { dueAt: 'asc' }, take: remaining
    });
    for (const trigger of triggers) {
      if (remaining <= 0) break;
      const claimed = await prisma.taskMonitoringTrigger.updateMany({
        where: { id: trigger.id, state: 'pending', dueAt: trigger.dueAt },
        data: { state: 'fired' }
      });
      if (!claimed.count) continue;
      const hasAnswer = await prisma.taskAiMessage.findFirst({
        where: {
          taskId: trigger.taskId, userId: trigger.userId, role: 'user',
          createdAt: { gt: trigger.updatedAt }
        }, select: { id: true }
      });
      if (hasAnswer) {
        await prisma.taskMonitoringTrigger.update({
          where: { id: trigger.id }, data: { state: 'answered' }
        });
        continue;
      }
      const eventKey = 'trigger:' + trigger.id;
      await prisma.taskMonitoringRun.createMany({
        data: [{ taskId: trigger.taskId, userId: trigger.userId,
          eventKey, kind: 'trigger', state: 'pending' }],
        skipDuplicates: true
      });
      const row = await prisma.taskMonitoringRun.findUnique({
        where: { eventKey }, select: { id: true, state: true }
      });
      if (!row) continue;
      const exclusive = await prisma.taskMonitoringRun.updateMany({
        where: { id: row.id, state: 'pending' }, data: { state: 'processing' }
      });
      if (!exclusive.count) continue;
      remaining -= 1;
      const check = async () => {
        const pending = await prisma.taskMonitoringTrigger.findUnique({
          where: { id: trigger.id }, select: { state: true }
        });
        if (pending?.state !== 'fired') return false;
        const answered = await prisma.taskAiMessage.findFirst({
          where: { taskId: trigger.taskId, userId: trigger.userId,
            role: 'user', createdAt: { gt: trigger.updatedAt } },
          select: { id: true }
        });
        return !answered;
      };
      await deliver({ id: row.id, taskId: trigger.taskId, userId: trigger.userId },
        'Пользователь пока не ответил на вопрос: ' + trigger.question +
        '. Вежливо уточни в существующем чате задачи, что осталось сделать.', check);
    }

    if (remaining <= 0) return;
    const jobs = await prisma.taskMonitoringRun.findMany({
      where: { kind: 'overdue', state: 'scheduled', dueAt: { lte: now } },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: remaining, select: {
        id: true, taskId: true, userId: true, sourceTaskId: true, dueAt: true
      }
    });
    for (const job of jobs) {
      if (!job.sourceTaskId || !job.dueAt) continue;
      const claimed = await prisma.taskMonitoringRun.updateMany({
        where: { id: job.id, state: 'scheduled', dueAt: job.dueAt },
        data: { state: 'processing' }
      });
      if (!claimed.count) continue;
      console.info('[TaskMonitoring] deadline claimed', {
        runId: job.id, taskId: job.taskId, sourceTaskId: job.sourceTaskId,
        dueAt: job.dueAt.toISOString()
      });
      remaining -= 1;
      const check = async () => Boolean(
        await deadlineStillCurrent(job.taskId, job.sourceTaskId!, job.dueAt!)
      );
      const source = await deadlineStillCurrent(job.taskId, job.sourceTaskId, job.dueAt);
      if (!source) { await markRun(job.id, 'cancelled'); continue; }
      await deliver({ id: job.id, userId: job.userId, taskId: job.taskId },
        (source.id === job.taskId ? 'Просрочен срок задачи: ' : 'Просрочена подзадача: ') +
        source.title + '. Дедлайн UTC: ' + job.dueAt.toISOString(), check);
    }
  } finally {
    running = false;
    void armNextDeadline().catch(error =>
      console.error('[TaskMonitoring] timer scheduling failed', error));
  }
}

/** One local timer for the closest persisted event, never one AI process per task. */
async function armNextDeadline() {
  const revision = ++timerRevision;
  if (timer) { clearTimeout(timer); timer = null; }
  const [run, trigger] = await Promise.all([
    prisma.taskMonitoringRun.findFirst({
      where: { kind: 'overdue', state: 'scheduled', dueAt: { not: null } },
      orderBy: { dueAt: 'asc' }, select: { dueAt: true }
    }),
    prisma.taskMonitoringTrigger.findFirst({
      where: { state: 'pending', task: {
        aiMonitoringEnabled: true, parentTaskId: null, collaborationId: null,
        taskType: 'TASK', status: { not: 'DONE' }
      } }, orderBy: { dueAt: 'asc' },
      select: { dueAt: true }
    })
  ]);
  if (revision !== timerRevision) return;
  const nextDue = [run?.dueAt, trigger?.dueAt].filter((d): d is Date => d instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (!nextDue) return;
  const waitMs = Math.min(MAX_LOCAL_TIMER_MS, Math.max(20, nextDue.getTime() - Date.now()));
  timer = setTimeout(() => {
    timer = null;
    void pollTaskMonitoring().catch(error =>
      console.error('[TaskMonitoring] event dispatch failed', error));
  }, waitMs);
  timer.unref();
}

export function startTaskMonitoringWorker() {
  console.info('[TaskMonitoring] event worker started');
  registerTaskMonitoringWakeup(() => {
    // A newly created job can already be overdue. Dispatch immediately,
    // rather than relying on the timer when many task updates race.
    void pollTaskMonitoring().catch(error =>
      console.error('[TaskMonitoring] immediate dispatch failed', error));
    void armNextDeadline().catch(error =>
      console.error('[TaskMonitoring] wakeup failed', error));
  });
  // Crash recovery is a one-time bootstrap of previously opted-in tasks.
  // Restarts never depend on in-memory timeouts surviving the process.
  void (async () => {
    console.info('[TaskMonitoring] recovery starting');
    await prisma.taskMonitoringRun.updateMany({
      where: { state: 'processing', updatedAt: { lt: new Date(Date.now() - 15 * 60_000) } },
      data: { state: 'failed' } // at most once; do not double-charge for partial AI calls
    });
    await recoverMonitoredDeadlinesOnBoot();
    await pollTaskMonitoring();
  })().catch(error => console.error('[TaskMonitoring] queue recovery failed', error));
  // Fallback checks ONLY persisted scheduled events, for missed process
  // wakeups, replica-local timers, and transient restarts.
  setInterval(() => {
    void pollTaskMonitoring().catch(error =>
      console.error('[TaskMonitoring] recovery tick failed', error));
  }, RECOVERY_INTERVAL_MS).unref();
}
