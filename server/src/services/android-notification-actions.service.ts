import { createHash } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { taskAccessWhere } from '../lib/task-access.js';
import { taskSystemNotificationEventKey } from '../lib/task-notification-persistence.js';

export type ActionEvent = { id: string; userId: string; taskId: string | null; eventKey: string; content: string; androidActionRef?: string | null; androidActionTaken?: string | null };
export type AndroidActions = {
  commands: string[]; chatId?: string; habitId?: string; openAi?: boolean; taskChat?: boolean;
  progress?: number; max?: number; status?: string; preview?: string; replyHash?: string; hide?: boolean;
};

export function originalAndroidEventKey(eventKey: string): string {
  return eventKey.startsWith('android-snooze:') ? eventKey.split(':').slice(2).join(':') : eventKey;
}
export function notificationReplyHash(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex');
}
export function isDeadlineEvent(key: string, taskId: string | null): boolean {
  return Boolean(taskId && (key.startsWith('reminder:') || key.endsWith(':upcoming') || key.endsWith(':overdue')));
}
export async function currentNotificationTask(event: ActionEvent) {
  if (!event.taskId) return null;
  const key = originalAndroidEventKey(event.eventKey);
  const task = await prisma.task.findFirst({
    where: { id: event.taskId, AND: [taskAccessWhere(event.userId)] },
    include: { collaboration: { include: { members: { where: { userId: event.userId } } } } }
  });
  if (!task || !task.dueDate) return null;
  const shared = Boolean(task.collaboration && !task.parentTaskId);
  const status = shared ? task.collaboration?.members[0]?.statusOverride ?? task.status : task.status;
  if (status === 'DONE') return null;
  const due = task.dueDate.toISOString();
  const expected = key.startsWith('reminder:') ? 'reminder:' + task.id + ':' + due :
    taskSystemNotificationEventKey(task.id, due, event.userId, shared, key.endsWith(':upcoming') ? 'upcoming' : 'overdue');
  return expected === key ? task : null;
}
function proposalCommands(status: string | undefined, autoApplied: boolean | undefined): AndroidActions {
  if (status === 'APPLIED') return { commands: [], status: 'Изменения применены' };
  if (status === 'PENDING' && !autoApplied) return { commands: ['proposal_approve', 'proposal_reject'] };
  return { commands: [], ...(status ? { status: status === 'REJECTED' ? 'Предложение отклонено' : 'Откройте для проверки статуса' } : {}) };
}
function replyCommands(text: string | null | undefined, status: string | undefined): AndroidActions {
  if (status === 'SENT') return { commands: [], status: 'Ответ отправлен' };
  if (status !== 'PENDING' || !text?.trim()) return { commands: [] };
  const preview = text.trim();
  // Never send an unseen/truncated draft from the notification. Longer replies
  // are reviewed and edited in the exact assistant conversation.
  if (preview.length > 240) return { commands: [], status: 'Откройте для просмотра и отправки ответа' };
  return { commands: ['reply_send'], preview, replyHash: notificationReplyHash(preview) };
}

export async function describeAndroidNotification(event: ActionEvent): Promise<AndroidActions> {
  const key = originalAndroidEventKey(event.eventKey);
  const parts = key.split(':');
  if (parts[0] === 'habit-reminder' && parts.length >= 3) {
    const habit = await prisma.habit.findFirst({ where: { id: parts[1], userId: event.userId, isArchived: false, isAutoCompleted: false } });
    if (!habit) return { commands: [], hide: true };
    const aggregate = await prisma.habitCompletion.aggregate({ where: { habitId: habit.id, userId: event.userId, dateKey: parts[2] }, _sum: { amount: true } });
    const progress = aggregate._sum.amount ?? 0;
    return { habitId: habit.id, progress, max: habit.targetCount,
      commands: progress >= habit.targetCount ? [] : ['habit_done', 'snooze'],
      ...(progress >= habit.targetCount ? { status: 'Привычка выполнена', hide: event.eventKey.startsWith('android-snooze:') } : {}) };
  }
  if (isDeadlineEvent(key, event.taskId)) {
    if (event.androidActionTaken) return { commands: [], status: 'Действие уже обработано' };
    return await currentNotificationTask(event) ? { commands: ['task_done', 'snooze'] } : { commands: [], hide: true };
  }
  if (key.startsWith('monitoring:')) return { commands: [], taskChat: true };
  if (/^telegram-ai-(?:task|reply|auto-reply):/.test(key)) {
    const task = key.startsWith('telegram-ai-task:');
    const eventId = task ? key.slice('telegram-ai-task:'.length) : key.replace(/:sent$/, '');
    const row = await prisma.telegramAiInboxEvent.findFirst({ where: { id: eventId, userId: event.userId }, include: { policy: true } });
    if (!row) return { commands: [], openAi: true };
    const chatId = 'telegram-ai-assistant:' + row.policyId;
    if (task) {
      const proposal = await prisma.aiTaskProposal.findFirst({ where: { userId: event.userId, requestId: eventId, source: 'telegram_assistant' } });
      return { ...proposalCommands(proposal?.status, proposal?.autoApplied || row.policy.taskMode === 'AUTO'), chatId, openAi: true };
    }
    return { ...replyCommands(row.suggestedReplyText, row.policy.mode === 'SUGGEST' || row.suggestedReplyStatus === 'SENT' ? row.suggestedReplyStatus : undefined), chatId, openAi: true };
  }
  if (/^mail-ai-(?:task|reply|important):/.test(key)) {
    const row = await prisma.emailAnalysis.findFirst({ where: { id: parts[1], userId: event.userId }, include: { mailbox: true } });
    if (!row) return { commands: [], openAi: true };
    const chatId = 'mail-ai-assistant:' + row.mailboxId;
    if (key.startsWith('mail-ai-task:')) {
      const proposal = await prisma.aiTaskProposal.findFirst({ where: { userId: event.userId, requestId: row.id, source: 'email_assistant' } });
      return { ...proposalCommands(proposal?.status, proposal?.autoApplied || row.mailbox.taskMode === 'AUTO'), chatId, openAi: true };
    }
    if (key.startsWith('mail-ai-reply:'))
      return { ...replyCommands(row.suggestedReplyText, row.mailbox.replyMode === 'SUGGEST' || row.suggestedReplyStatus === 'SENT' ? row.suggestedReplyStatus : undefined), chatId, openAi: true };
    return { commands: [], chatId, openAi: true };
  }
  if (key.startsWith('economic-repeat:')) {
    const proposal = event.androidActionRef ? await prisma.economicAiProposal.findFirst({ where: { id: event.androidActionRef, userId: event.userId } }) : null;
    const spec = proposalCommands(proposal?.status, proposal?.autoApplied);
    return { ...spec, commands: spec.commands.length ? ['economic_approve', 'economic_reject'] : [], openAi: true };
  }
  if (key.startsWith('ai-checkup:')) return { commands: [], openAi: true };
  return { commands: [] };
}
