import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { requireMonitoredTask } from './task-monitoring.service.js';
import { telegramService } from './telegram.service.js';

/**
 * A single automatic answer is published to the existing task chat, quick AI
 * inbox and (if connected) Telegram. The event key
 * prevents duplicate mirrors on retried execution.
 */
export async function publishTaskMonitoringReply(input: {
  userId: string; taskId: string; runId: string; kind: 'overdue' | 'trigger'; answer: string;
}) {
  const task = await requireMonitoredTask(input.userId, input.taskId);
  const answer = input.answer.trim();
  if (!answer) return;
  const eventKey = 'monitoring:' + input.runId;
  const title = task.title.trim().slice(0, 150);
  const header = input.kind === 'trigger' ? 'Напоминание по триггеру' : 'Мониторинг задачи';
  const display = '🤖 ' + header + ' «' + title + '»\n\n' + answer;
  // Exactly one visible message belongs to Quick AI. A separate unread
  // notification row is badge-only and never rendered as a second bubble.
  const mirrored = await prisma.generalAiMessage.createMany({
    data: [{
      userId: input.userId, role: 'assistant', content: display.slice(0, 6500),
      monitoringTaskId: task.id, monitoringEventKey: eventKey,
      creditsSpentMilli: 0
    }],
    skipDuplicates: true
  });
  // Badge-only event: the client counts it as unread, but deliberately
  // excludes monitoring:* from the system-notification message timeline.
  // Keep this idempotent when a partial delivery is retried.
  try {
    await prisma.systemNotification.create({
      data: {
        userId: input.userId, taskId: task.id, eventKey,
        content: 'Новое сообщение мониторинга по задаче «' + title + '»'
      }
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
      console.warn('[TaskMonitoring] unread badge delivery failed', {
        taskId: task.id, runId: input.runId, error
      });
    }
  }
  if (mirrored.count !== 1) return;
  // A disconnected Telegram account cannot prevent the other three channels
  // from receiving their persisted messages.
  try {
    await telegramService.notifyMonitoringTaskReply({
      userId: input.userId, taskId: task.id, taskTitle: title, answer, kind: input.kind
    });
  } catch (error) {
    console.warn('[TaskMonitoring] Telegram monitoring delivery failed', {
      taskId: input.taskId, runId: input.runId,
      reason: error instanceof Error ? error.message : 'unknown'
    });
  }
}
