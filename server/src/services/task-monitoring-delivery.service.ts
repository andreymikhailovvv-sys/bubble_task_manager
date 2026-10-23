import { prisma } from '../db/prisma.js';
import { requireMonitoredTask } from './task-monitoring.service.js';
import { telegramService } from './telegram.service.js';

/**
 * A single automatic answer is published to the existing task chat, quick AI
 * inbox, browser/system feed and (if connected) Telegram. The event key
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
  const mirrored = await prisma.$transaction(async tx => {
    const claim = await tx.systemNotification.createMany({
      data: [{
        userId: input.userId, taskId: task.id, eventKey,
        content: header + ': «' + title + '». ИИ прислал сообщение. Открыть чат задачи.'
      }],
      skipDuplicates: true
    });
    if (claim.count !== 1) return false;
    await tx.generalAiMessage.create({
      data: { userId: input.userId, role: 'assistant', content: display.slice(0, 6500),
        monitoringTaskId: task.id, creditsSpentMilli: 0 }
    });
    return true;
  });
  if (!mirrored) return;
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
