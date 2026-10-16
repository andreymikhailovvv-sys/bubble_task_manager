import { Prisma, type TelegramAiChatPolicy } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { telegramService } from './telegram.service.js';
import { type MonitorSummary } from './telegram-ai-monitor-summary.service.js';

export const TELEGRAM_AI_PROJECT_ID = 'telegram-ai-assistant-project';
export const TELEGRAM_AI_PROJECT_TITLE = 'Телеграм ассистент';
export const TELEGRAM_AI_PROJECT_ICON = '✈️';
export const TELEGRAM_AI_CHAT_ID_PREFIX = 'telegram-ai-assistant:';
export const telegramAiThreadId = (policyId: string) => TELEGRAM_AI_CHAT_ID_PREFIX + policyId;

type PolicyForInbox = Pick<TelegramAiChatPolicy, 'id' | 'chatTitle' | 'chatId' | 'chatKind'>;

const clip = (value: string, max = 180) => value.trim().slice(0, max);
const listPart = (title: string, items: string[]) => items.length
  ? '\n\n' + title + '\n' + items.slice(0, 4).map(item => '• ' + clip(item)).join('\n')
  : '';

export function formatTelegramAiSummary(chatTitle: string, summary: MonitorSummary, taskMode: string) {
  const text = [
    '📨 Сводка Telegram · ' + clip(chatTitle, 90),
    '',
    clip(summary.summary, 900),
    listPart('✅ Решения', summary.decisions),
    listPart('📌 Обязательства', summary.obligations),
    listPart('❓ Открытые вопросы', summary.openQuestions),
    listPart('⚠️ Риски', summary.risks),
    taskMode === 'NONE' ? '' : listPart('📝 Предложения задач', summary.taskSuggestions)
  ].join('\n').trim();
  return text.slice(0, 3500);
}

export async function telegramAiInboxFeed(userId: string) {
  const [policies, events] = await Promise.all([
    prisma.telegramAiChatPolicy.findMany({
      where: { userId }, orderBy: { createdAt: 'asc' },
      select: { id: true, chatTitle: true, chatId: true, chatKind: true }
    }),
    prisma.telegramAiInboxEvent.findMany({
      where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 250,
      select: { id: true, policyId: true, content: true, createdAt: true, summary: true }
    })
  ]);
  return {
    projectId: TELEGRAM_AI_PROJECT_ID, projectTitle: TELEGRAM_AI_PROJECT_TITLE,
    projectIcon: TELEGRAM_AI_PROJECT_ICON,
    chats: policies.map(policy => ({
      id: telegramAiThreadId(policy.id), policyId: policy.id, telegramChatId: policy.chatId,
      title: policy.chatTitle, kind: policy.chatKind
    })),
    messages: events.reverse().map(event => ({
      id: event.id, chatId: telegramAiThreadId(event.policyId),
      role: 'assistant' as const, content: event.content,
      createdAt: event.createdAt.toISOString(),
      taskSuggestions: typeof event.summary === 'object' && event.summary && 'taskSuggestions' in event.summary
        ? (event.summary as { taskSuggestions?: unknown }).taskSuggestions : []
    }))
  };
}

// One transaction prevents an invisible summary (written only to policy) when
// the process terminates before publishing the linked chat event/notification.
export async function publishTelegramAiSummary(input: {
  policy: TelegramAiChatPolicy;
  leaseToken: string;
  lastSeenMessageId: number;
  summary: MonitorSummary;
}) {
  const { policy, summary } = input;
  const eventId = 'telegram-ai-summary:' + policy.id + ':' + input.lastSeenMessageId;
  const content = formatTelegramAiSummary(policy.chatTitle, summary, policy.taskMode);
  return prisma.$transaction(async tx => {
    const written = await tx.telegramAiChatPolicy.updateMany({
      where: {
        id: policy.id, userId: policy.userId, isEnabled: true,
        monitorRevision: policy.monitorRevision, leaseToken: input.leaseToken
      },
      data: { lastSummary: summary as unknown as Prisma.InputJsonValue, lastSummaryAt: new Date(), lastError: null }
    });
    if (!written.count) return false;
    await tx.telegramAiInboxEvent.upsert({
      where: { id: eventId },
      create: {
        id: eventId, userId: policy.userId, policyId: policy.id,
        messageId: input.lastSeenMessageId, content,
        summary: summary as unknown as Prisma.InputJsonValue,
        model: policy.monitorModel
      },
      update: {} // Idempotent: do not silently replace a previously delivered event.
    });
    await tx.systemNotification.upsert({
      where: { eventKey: eventId },
      create: {
        userId: policy.userId, eventKey: eventId,
        content: (summary.important && policy.notifyImportant ? '⚠️ ' : '📨 ') +
          'Telegram · ' + clip(policy.chatTitle, 55) + ': ' + clip(summary.summary, 145)
      },
      update: {}
    });
    return true;
  });
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let delivering = false;

/**
 * Process durable bot notifications. Claim before HTTP delivery; if an outbound
 * request has an unknown outcome, never automatically send it twice.
 */
export async function deliverTelegramAiBotNotifications() {
  if (delivering) return;
  delivering = true;
  try {
    // A crash during an outbound request is not proof that the bot didn't send it.
    await prisma.telegramAiInboxEvent.updateMany({
      where: { botStatus: 'SENDING', botClaimedAt: { lt: new Date(Date.now() - 3 * 60_000) } },
      data: { botStatus: 'UNKNOWN' }
    });
    for (let i = 0; i < 5; i++) {
      const candidate = await prisma.telegramAiInboxEvent.findFirst({
        where: { botStatus: 'PENDING' }, orderBy: { createdAt: 'asc' },
        select: { id: true, userId: true, content: true }
      });
      if (!candidate) break;
      const claimed = await prisma.telegramAiInboxEvent.updateMany({
        where: { id: candidate.id, botStatus: 'PENDING' },
        data: { botStatus: 'SENDING', botClaimedAt: new Date() }
      });
      if (!claimed.count) continue;
      try {
        const owner = await prisma.user.findUnique({
          where: { id: candidate.userId }, select: { telegramChatId: true }
        });
        if (!owner?.telegramChatId) {
          await prisma.telegramAiInboxEvent.update({
            where: { id: candidate.id }, data: { botStatus: 'SKIPPED' }
          });
          continue;
        }
        // Bot DM to the linked account, never send into the monitored chat.
        await telegramService.notifyDailyAiCheckup({
          userId: candidate.userId, text: escapeHtml(candidate.content.slice(0, 2600))
        });
        await prisma.telegramAiInboxEvent.update({
          where: { id: candidate.id },
          data: { botStatus: 'SENT', botDeliveredAt: new Date() }
        });
      } catch {
        // Avoid duplicates following timeouts/connection loss. Results remain
        // visible in the app and as a system notification.
        await prisma.telegramAiInboxEvent.updateMany({
          where: { id: candidate.id, botStatus: 'SENDING' }, data: { botStatus: 'UNKNOWN' }
        });
        console.warn('[TelegramAIInbox] bot delivery uncertain', { eventId: candidate.id });
      }
    }
  } finally {
    delivering = false;
  }
}
