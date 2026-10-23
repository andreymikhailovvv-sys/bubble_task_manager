import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { aiAssistantService } from './ai-assistant.service.js';
import { requireMonitoredTask } from './task-monitoring.service.js';

const MAX_AUTOMATIC_TASK_CALLS_PER_TICK = 8;
let running = false;

const monitoredTaskWhere = {
  aiMonitoringEnabled: true, parentTaskId: null, collaborationId: null, taskType: 'TASK' as const,
  status: { not: 'DONE' as const }
};

async function callTaskMonitor(userId: string, taskId: string, eventKey: string, question: string, kind: string) {
  // Cross-replica durable idempotency: only one process can insert this event key.
  let run: { id: string };
  try {
    run = await prisma.taskMonitoringRun.create({ data: { taskId, userId, eventKey, kind } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
    throw error;
  }
  try {
    await requireMonitoredTask(userId, taskId);
    const history = await aiAssistantService.listTaskDialogForContext({ userId, taskId });
    const statuses = await prisma.taskMonitoringStatus.findMany({
      where: { userId, taskId }, orderBy: { createdAt: 'desc' }, take: 8,
      select: { label: true, createdAt: true }
    });
    const result = await aiAssistantService.askTaskAssistant({
      userId, taskId, history, question: [
        'Это автоматический запрос сервера в рамках ВКЛЮЧЁННОГО beta-мониторинга задачи.',
        question,
        'Ориентируйся на последнюю переписку и историю статусов:',
        statuses.map(item => item.createdAt.toISOString() + ': ' + item.label).join('\n') || 'Статусов ещё нет.',
        'Если можешь сделать полезную часть работы прямо сейчас, сделай и пришли результат.',
        'Если не хватает информации, задай короткие точные вопросы и используй инструмент set_task_monitoring_trigger.',
        'Если выполнение зависит только от пользователя, спроси, выполнил ли он действие, и запусти триггер.',
        'Не заявляй об отправке внешних сообщений и других действиях без подтверждения.'
      ].join('\n'),
      mode: 'fast', billingMode: 'dynamic', billingFeature: 'overdue_nudge'
    });
    // Opt-out during slow model execution wins over a stale automated answer.
    await requireMonitoredTask(userId, taskId);
    await aiAssistantService.appendTaskDialogAssistantMessage({
      userId, taskId, content: result.answer, creditsSpentMilli: result.billing.creditsSpentMilli
    });
    await prisma.taskMonitoringRun.update({ where: { id: run.id }, data: { state: 'completed' } });
  } catch (error) {
    // Failed requests never retry every minute, protecting user credits.
    await prisma.taskMonitoringRun.update({ where: { id: run.id }, data: { state: 'failed' } });
    console.error('[TaskMonitoring] automatic check failed', { taskId, eventKey, reason: error instanceof Error ? error.message : 'unknown' });
  }
}

export async function pollTaskMonitoring(now = new Date()) {
  if (running) return;
  running = true;
  try {
    let remaining = MAX_AUTOMATIC_TASK_CALLS_PER_TICK;
    const triggers = await prisma.taskMonitoringTrigger.findMany({
      where: { state: 'pending', dueAt: { lte: now }, task: monitoredTaskWhere },
      orderBy: { dueAt: 'asc' }, take: remaining
    });
    for (const trigger of triggers) {
      if (remaining-- <= 0) break;
      const claimed = await prisma.taskMonitoringTrigger.updateMany({
        where: { id: trigger.id, state: 'pending' }, data: { state: 'fired' }
      });
      if (claimed.count === 0) continue;
      const replied = await prisma.taskAiMessage.findFirst({
        where: { taskId: trigger.taskId, userId: trigger.userId, role: 'user', createdAt: { gt: trigger.updatedAt } },
        select: { id: true }
      });
      if (replied) {
        await prisma.taskMonitoringTrigger.update({ where: { id: trigger.id }, data: { state: 'answered' } });
        continue;
      }
      await callTaskMonitor(trigger.userId, trigger.taskId, 'trigger:' + trigger.id,
        'Время ожидания ответа истекло. Пользователь не ответил на вопрос: ' + trigger.question +
        '. Вежливо напомни в чате, что осталось уточнить.', 'trigger');
    }
    if (remaining <= 0) return;
    const roots = await prisma.task.findMany({
      where: {
        ...monitoredTaskWhere,
        OR: [{ dueDate: { lt: now } }, { subtasks: { some: { status: { not: 'DONE' }, dueDate: { lt: now } } } }]
      },
      include: { subtasks: { where: { status: { not: 'DONE' }, dueDate: { lt: now } }, select: { id: true, title: true, dueDate: true } } },
      take: 24
    });
    for (const root of roots) {
      const events = [
        ...(root.dueDate && root.dueDate < now ? [{ id: root.id, name: root.title, due: root.dueDate, kind: 'task' }] : []),
        ...root.subtasks.filter(subtask => subtask.dueDate).map(subtask => ({
          id: subtask.id, name: subtask.title, due: subtask.dueDate!, kind: 'subtask'
        }))
      ];
      for (const event of events) {
        if (remaining-- <= 0) return;
        const key = 'overdue:' + root.id + ':' + event.id + ':' + event.due.toISOString();
        await callTaskMonitor(root.userId, root.id, key,
          (event.kind === 'subtask' ? 'Просрочена подзадача: ' : 'Просрочен срок задачи: ') +
          event.name + '. Дедлайн UTC: ' + event.due.toISOString(), 'overdue');
      }
    }
  } finally {
    running = false;
  }
}
