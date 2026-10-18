import { prepareTaskProposal, proposalView, type TaskProposalAction } from './ai-task-proposal.service.js';
import { Prisma, type TelegramAiChatPolicy } from '@prisma/client';
import { FixedWindowRateLimiter } from '../lib/security-rate-limiter.js';
import { parseTelegramSendTargetId, telegramSendTargetFromDialog } from './telegram-send-targets.service.js';
import { connectedOwner, openClient } from './telegram-user-client-send.service.js';
import { telegramUserChatCapability } from './telegram-user-client-chat-access.service.js';
import { prisma } from '../db/prisma.js';
import { telegramService } from './telegram.service.js';
import { normalizeMonitorTaskAction, type MonitorSummary } from './telegram-ai-monitor-summary.service.js';
import type { PlannerActionInput } from './planner-tools.service.js';
import { TelegramUserClientError } from './telegram-user-client-auth.service.js';

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
    '' // Task proposals are rendered as interactive cards, not duplicated in text.
  ].join('\n').trim();
  return text.slice(0, 3500);
}

// Old events keep string titles; new events contain validated planner actions.
export function telegramProposalActions(rawSuggestions: unknown, eventId: string, mode: string): TaskProposalAction[] {
  const values: unknown[] = Array.isArray(rawSuggestions) ? rawSuggestions.slice(0, 4) : [];
  const actions: TaskProposalAction[] = [];
  values.forEach((value, index) => {
    if (typeof value === 'string') {
      const title = clip(value, 180);
      if (title) actions.push({ type: 'telegram_suggestion', title, eventId, index });
      return;
    }
    const action = normalizeMonitorTaskAction(value);
    if (!action) return;
    // An automatic monitoring policy only grants permission to CREATE,
    // never to mutate or delete existing tasks following a third-party chat.
    if (mode === 'AUTO' &&
      !['create_task', 'create_event', 'create_reminder', 'create_subtask'].includes(action.operation)) return;
    actions.push(action);
  });
  return actions;
}

async function prepareTelegramProposal(userId: string, eventId: string, mode: string, raw: unknown) {
  const actions = telegramProposalActions(raw, eventId, mode);
  if (!actions.length) return;
  const refs = actions.filter(a => typeof a.operation === 'string') as PlannerActionInput[];
  const proposal = await prepareTaskProposal({
    userId, source: 'telegram_assistant', requestId: eventId,
    actions,
    resolvedItemIds: refs.flatMap(a => [a.itemId, a.parentTaskId].filter((id): id is string => !!id)),
    resolvedSphereIds: refs.flatMap(a => a.sphereId ? [a.sphereId] : []),
    autoApply: mode === 'AUTO'
  });
  // Dedicated notification, including task-only cycles with summaries off.
  const event = await prisma.telegramAiInboxEvent.findFirst({
    where: { id: eventId, userId }, select: { policyId: true, policy: { select: { chatTitle: true } } }
  });
  if (event) {
    await prisma.systemNotification.upsert({
      where: { eventKey: 'telegram-ai-task:' + eventId },
      create: {
        userId, eventKey: 'telegram-ai-task:' + eventId,
        content: '📌 Telegram-ассистент · ' + clip(event.policy.chatTitle, 60) +
          ': ' + (proposal.status === 'APPLIED' ? 'добавлены задачи' : 'предложены изменения задач') +
          ' (' + actions.length + '). ' +
          actions.slice(0, 2).map(action => clip(String(action.title ?? ''), 70)).join('; ')
      },
      update: {}
    });
  }
}

export async function telegramAiInboxFeed(userId: string) {
  const [policies, events] = await Promise.all([
    prisma.telegramAiChatPolicy.findMany({
      where: { userId }, orderBy: { createdAt: 'asc' },
      select: { id: true, chatTitle: true, chatId: true, chatKind: true }
    }),
    prisma.telegramAiInboxEvent.findMany({
      where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 250,
      select: { id: true, policyId: true, taskModeAtPublish: true, content: true, createdAt: true, summary: true,
        suggestedReplyMessageId: true, suggestedReplyText: true, suggestedReplyStatus: true }
    })
  ]);
  const approvals = events.length ? await prisma.telegramAiTaskApproval.findMany({
    where: { userId, eventId: { in: events.map(event => event.id) } },
    select: { eventId: true, itemIndex: true }
  }) : [];
  const approvedByEvent = new Map<string, number[]>();
  for (const approval of approvals) {
    approvedByEvent.set(approval.eventId, [...(approvedByEvent.get(approval.eventId) ?? []), approval.itemIndex]);
  }
  // Upgrade old published summaries lazily as well as those created by the monitor.
  // Stable event ID means a retry never creates a second task proposal.
  for (const event of events) {
    if (event.taskModeAtPublish === 'NONE') continue;
    const summary = event.summary as { taskSuggestions?: unknown };
    await prepareTelegramProposal(userId, event.id, event.taskModeAtPublish, summary?.taskSuggestions);
  }
  const pendingProposals = events.length ? await prisma.aiTaskProposal.findMany({
    where: { userId, source: 'telegram_assistant', requestId: { in: events.map(e => e.id) } }
  }) : [];
  const proposalByEvent = new Map(pendingProposals.map(p => [p.requestId, proposalView(p)]));
  return {
    projectId: TELEGRAM_AI_PROJECT_ID, projectTitle: TELEGRAM_AI_PROJECT_TITLE,
    projectIcon: TELEGRAM_AI_PROJECT_ICON,
    chats: policies.map(policy => ({
      id: telegramAiThreadId(policy.id), policyId: policy.id, telegramChatId: policy.chatId,
      title: policy.chatTitle, kind: policy.chatKind
    })),
    messages: events.reverse().map(event => ({
      id: event.id, chatId: telegramAiThreadId(event.policyId),
      approvedSuggestionIndices: approvedByEvent.get(event.id) ?? [],
      role: 'assistant' as const, content: event.content,
      createdAt: event.createdAt.toISOString(),
      taskProposal: proposalByEvent.get(event.id) ?? null,
      telegramSuggestedReply: event.suggestedReplyMessageId != null && event.suggestedReplyText
        ? { eventId: event.id, messageId: event.suggestedReplyMessageId,
          text: event.suggestedReplyText, status: event.suggestedReplyStatus,
          chatTitle: policies.find(p => p.id === event.policyId)?.chatTitle ?? 'Telegram' }
        : null,
      taskSuggestions: typeof event.summary === 'object' && event.summary && 'taskSuggestions' in event.summary
        ? (Array.isArray((event.summary as { taskSuggestions?: unknown }).taskSuggestions)
            ? ((event.summary as { taskSuggestions: unknown[] }).taskSuggestions)
              .map(item => typeof item === 'string' ? item :
                item && typeof item === 'object' && 'title' in item ? String(item.title ?? '') : '')
            : []) : []
    }))
  };
}

// One transaction prevents an invisible summary (written only to policy) when
// the process terminates before publishing the linked chat event/notification.
export async function publishTelegramAiSummary(input: {
  policy: TelegramAiChatPolicy;
  leaseToken: string;
  lastSeenMessageId: number;
  requestId: string;
  summary: MonitorSummary;
}) {
  const { policy, summary } = input;
  const eventId = 'telegram-ai-summary:' + policy.id + ':' + input.requestId;
  const content = formatTelegramAiSummary(policy.chatTitle, summary, policy.taskMode);
  const published = await prisma.$transaction(async tx => {
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
        messageId: input.lastSeenMessageId, taskModeAtPublish: policy.taskMode, content,
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
  if (published && policy.taskMode !== 'NONE') {
    await prepareTelegramProposal(policy.userId, eventId, policy.taskMode, summary.taskSuggestions);
  }
  return published;
}


/** Publish an editable, owner-approved reply chip only to the matching managed AI thread. */
export async function publishTelegramAiReplySuggestion(input: {
  policy: TelegramAiChatPolicy; leaseToken: string; messageId: number; text: string;
}) {
  const { policy } = input;
  if (!Number.isSafeInteger(input.messageId) || input.messageId <= 0 || !input.text.trim()) return false;
  const eventId = 'telegram-ai-reply:' + policy.id + ':' + input.messageId;
  return prisma.$transaction(async tx => {
    const valid = await tx.telegramAiChatPolicy.findFirst({
      where: { id: policy.id, userId: policy.userId, mode: 'SUGGEST',
        isEnabled: true, monitorRevision: policy.monitorRevision, leaseToken: input.leaseToken },
      select: { id: true }
    });
    if (!valid) return false;
    await tx.telegramAiInboxEvent.upsert({
      where: { id: eventId },
      create: {
        id: eventId, userId: policy.userId, policyId: policy.id, messageId: input.messageId,
        taskModeAtPublish: 'NONE', botStatus: 'SKIPPED',
        content: '💬 Предлагаю ответить в Telegram · ' + clip(policy.chatTitle, 90),
        summary: { taskSuggestions: [] },
        model: policy.monitorModel,
        suggestedReplyMessageId: input.messageId, suggestedReplyText: input.text.trim().slice(0, 1000)
      },
      update: {}
    });
    await tx.systemNotification.upsert({
      where: { eventKey: eventId },
      create: { userId: policy.userId, eventKey: eventId,
        content: '💬 ИИ предложил ответ в Telegram · ' + clip(policy.chatTitle, 90) },
      update: {}
    });
    return true;
  });
}

/** Task mode is independent of summary frequency: publish actual task suggestions
 * even if summary output has been disabled by the owner. */
export async function publishTelegramAiTaskSuggestions(input: {
  policy: TelegramAiChatPolicy; leaseToken: string; lastSeenMessageId: number;
  requestId: string; summary: MonitorSummary;
}) {
  const { policy, summary } = input;
  if (policy.taskMode === 'NONE' || !summary.taskSuggestions.length) return false;
  const eventId = 'telegram-ai-tasks:' + policy.id + ':' + input.requestId;
  const written = await prisma.$transaction(async tx => {
    const valid = await tx.telegramAiChatPolicy.findFirst({
      where: { id: policy.id, userId: policy.userId, isEnabled: true,
        monitorRevision: policy.monitorRevision, leaseToken: input.leaseToken },
      select: { id: true }
    });
    if (!valid) return false;
    await tx.telegramAiInboxEvent.upsert({
      where: { id: eventId },
      create: {
        id: eventId, userId: policy.userId, policyId: policy.id,
        messageId: input.lastSeenMessageId, taskModeAtPublish: policy.taskMode,
        botStatus: 'PENDING',
        content: '📌 Telegram-ассистент предлагает задачи · ' + clip(policy.chatTitle, 90),
        summary: { taskSuggestions: summary.taskSuggestions },
        model: policy.monitorModel
      },
      update: {}
    });
    return true;
  });
  if (written) await prepareTelegramProposal(
    policy.userId, eventId, policy.taskMode, summary.taskSuggestions
  );
  return written;
}

const suggestionSendLimiter = new FixedWindowRateLimiter(10, 60_000);

/** A confirmed click from the owner is the only path from a proposal chip
 * to Telegram. The destination is fixed by the stored policy, never by AI text. */
export async function sendTelegramAiSuggestedReply(userId: string, eventId: string, rawText: unknown) {
  if (typeof rawText !== 'string' || !rawText.trim() || rawText.trim().length > 1000 ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(rawText)) {
    throw new TelegramUserClientError(400, 'Ответ должен содержать от 1 до 1000 символов');
  }
  if (!suggestionSendLimiter.consume(userId).allowed) {
    throw new TelegramUserClientError(429, 'Слишком много попыток отправки');
  }
  const item = await prisma.telegramAiInboxEvent.findFirst({
    where: { id: eventId, userId, suggestedReplyMessageId: { not: null },
      suggestedReplyStatus: { in: ['PENDING', 'FAILED'] } },
    include: { policy: true }
  });
  if (!item || !item.suggestedReplyMessageId ||
      !item.policy.isEnabled || item.policy.mode !== 'SUGGEST') {
    throw new TelegramUserClientError(409, 'Предложение недоступно или настройки ассистента изменились');
  }
  const access = await telegramUserChatCapability(userId);
  if (!access.connected || !access.readEnabled || !access.sendEnabled) {
    throw new TelegramUserClientError(403, 'Не разрешена отправка через личный Telegram');
  }
  const parsed = parseTelegramSendTargetId(item.policy.chatId);
  if (!parsed) throw new TelegramUserClientError(400, 'Переписка Telegram недоступна');
  const claim = await prisma.telegramAiInboxEvent.updateMany({
    where: { id: item.id, userId, suggestedReplyStatus: { in: ['PENDING', 'FAILED'] } },
    data: { suggestedReplyStatus: 'SENDING', suggestedReplyText: rawText.trim() }
  });
  if (!claim.count) throw new TelegramUserClientError(409, 'Это предложение уже отправляется');
  let started = false;
  let client: Awaited<ReturnType<typeof openClient>> | null = null;
  try {
    const owner = await connectedOwner(userId);
    client = await openClient(owner);
    const dialogs = await client.getDialogs({ limit: 150, ignoreMigrated: true });
    const row = dialogs.find(dialog =>
      telegramSendTargetFromDialog(dialog, owner.telegramAccountId)?.id === item.policy.chatId);
    const target = row && telegramSendTargetFromDialog(row, owner.telegramAccountId);
    if (!row || !target || target.kind !== parsed.kind) {
      throw new TelegramUserClientError(404, 'Выбранная переписка не найдена');
    }
    const latest = await prisma.telegramAiInboxEvent.findFirst({
      where: { id: eventId, userId, suggestedReplyStatus: 'SENDING', policy: {
        mode: 'SUGGEST', isEnabled: true, chatId: item.policy.chatId } }
    });
    const fresh = await connectedOwner(userId);
    const permission = await telegramUserChatCapability(userId);
    if (!latest || !permission.readEnabled || !permission.sendEnabled ||
        fresh.telegramAccountId !== owner.telegramAccountId ||
        fresh.encryptedSession !== owner.encryptedSession) {
      throw new TelegramUserClientError(409, 'Доступ к Telegram изменился');
    }
    started = true;
    await client.sendMessage(row.inputEntity, {
      message: rawText.trim(), replyTo: item.suggestedReplyMessageId,
      formattingEntities: [], linkPreview: false
    });
    await prisma.telegramAiInboxEvent.updateMany({
      where: { id: eventId, userId, suggestedReplyStatus: 'SENDING' },
      data: { suggestedReplyStatus: 'SENT' }
    });
    return { ok: true, status: 'SENT' as const };
  } catch (error) {
    const status = started ? 'UNKNOWN' : 'FAILED';
    await prisma.telegramAiInboxEvent.updateMany({
      where: { id: eventId, userId, suggestedReplyStatus: 'SENDING' },
      data: { suggestedReplyStatus: status }
    }).catch(() => {});
    console.warn('[TelegramSuggestedReply] delivery', { eventId, outcome: status });
    if (started) return { ok: false, status: 'UNKNOWN' as const };
    throw error;
  } finally {
    if (client) try { await client.disconnect(); } catch { /* best effort */ }
  }
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Bot representation of the same durable chip; never parse model text as markup. */
export function telegramTaskProposalBotText(chatTitle: string, operations: Array<{
  title: string; type: string; dueDate?: string | null; details?: string[];
}>, timeZone = 'Europe/Moscow'): string {
  const kind: Record<string, string> = {
    create_task: 'Задача', create_event: 'Событие', create_reminder: 'Напоминание',
    create_subtask: 'Подзадача'
  };
  const lines = ['📌 <b>Telegram-ассистент предлагает изменения</b>',
    'Чат: <b>' + escapeHtml(chatTitle.slice(0, 90)) + '</b>'];
  for (const action of operations.slice(0, 4)) {
    const date = action.dueDate ? new Date(action.dueDate) : null;
    const deadline = date && Number.isFinite(date.getTime())
      ? date.toLocaleString('ru-RU', { timeZone, day: 'numeric', month: 'long',
          year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
    lines.push('', '• <b>' + escapeHtml(action.title.slice(0, 180)) + '</b>',
      kind[action.type] ?? 'Изменение задачи');
    if (deadline) lines.push('⏰ ' + escapeHtml(deadline));
    for (const detail of (action.details ?? []).slice(0, 3)) {
      lines.push(escapeHtml(detail.slice(0, 160)));
    }
  }
  return lines.join('\n').slice(0, 3800);
}

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
        select: { id: true, userId: true, content: true,
          summary: true, policyId: true, policy: { select: { chatTitle: true } } }
      });
      if (!candidate) break;
      const hasSuggestions = Array.isArray((candidate.summary as { taskSuggestions?: unknown } | null)?.taskSuggestions) &&
        ((candidate.summary as { taskSuggestions: unknown[] }).taskSuggestions).length > 0;
      const proposal = hasSuggestions
        ? await prisma.aiTaskProposal.findUnique({
            where: { userId_requestId: { userId: candidate.userId, requestId: candidate.id } }
          }) : null;
      // Proposal creation happens AFTER the inbox event transaction. Wait for
      // the durable chip before sending its buttons, not a premature plain text.
      if (hasSuggestions && !proposal && candidate.id.startsWith('telegram-ai-') &&
          Date.now() - (await prisma.telegramAiInboxEvent.findUnique({
            where: { id: candidate.id }, select: { createdAt: true }
          }))!.createdAt.getTime() < 300_000) break;
      const claimed = await prisma.telegramAiInboxEvent.updateMany({
        where: { id: candidate.id, botStatus: 'PENDING' },
        data: { botStatus: 'SENDING', botClaimedAt: new Date() }
      });
      if (!claimed.count) continue;
      try {
        const owner = await prisma.user.findUnique({
          where: { id: candidate.userId }, select: { telegramChatId: true }
        });
        if (!owner?.telegramChatId || !process.env.TELEGRAM_BOT_TOKEN?.trim()) {
          await prisma.telegramAiInboxEvent.update({
            where: { id: candidate.id }, data: { botStatus: 'SKIPPED' }
          });
          continue;
        }
        // Bot DM to linked owner only, never to the monitored third-party chat.
        if (proposal && candidate.policyId) {
          const view = proposalView(proposal);
          const ownerTimeZone = await prisma.user.findUnique({
            where: { id: candidate.userId }, select: { timeZone: true }
          });
          const sent = await telegramService.notifyTelegramAiTaskProposal({
            userId: candidate.userId, policyId: candidate.policyId, proposalId: proposal.id,
            pending: view.status === 'PENDING',
            text: telegramTaskProposalBotText(candidate.policy.chatTitle, view.operations,
              ownerTimeZone?.timeZone ?? 'Europe/Moscow')
          });
          if (!sent) throw new Error('Telegram Bot API rejected task proposal message');
        } else {
          await telegramService.notifyDailyAiCheckup({
            userId: candidate.userId, text: escapeHtml(candidate.content.slice(0, 2600))
          });
        }
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

/** Explicit, idempotent, owner-approved creation. Monitoring never creates
 * Planovych tasks automatically regardless of the AUTO setting in PR2. */
export async function approveTelegramAiSuggestedTask(userId: string, eventId: string, index: number) {
  if (!Number.isInteger(index) || index < 0 || index > 3) {
    throw new TelegramUserClientError(400, 'Недопустимый номер предложения задачи');
  }
  const event = await prisma.telegramAiInboxEvent.findFirst({
    where: { id: eventId, userId }, include: { policy: { select: { taskMode: true, chatTitle: true } } }
  });
  if (!event) throw new TelegramUserClientError(404, 'Предложение не найдено');
  if (event.policy.taskMode === 'NONE') throw new TelegramUserClientError(403, 'Предложения задач отключены');
  const summary = event.summary as { taskSuggestions?: unknown };
  const options = Array.isArray(summary?.taskSuggestions) ? summary.taskSuggestions : [];
  const title = typeof options[index] === 'string' ? options[index].trim().slice(0, 220) : '';
  if (!title) throw new TelegramUserClientError(404, 'Предложение задачи недоступно');
  const approvalId = eventId + ':' + index;
  try {
    const task = await prisma.$transaction(async tx => {
      await tx.telegramAiTaskApproval.create({
        data: { id: approvalId, userId, eventId, itemIndex: index, taskId: '' }
      });
      const created = await tx.task.create({
        data: {
          userId, title, status: 'TODO',
          description: 'Предложено ИИ по Telegram-переписке «' + event.policy.chatTitle.slice(0, 100) + '». Проверьте сроки и содержание перед выполнением.'
        }
      });
      await tx.telegramAiTaskApproval.update({
        where: { id: approvalId }, data: { taskId: created.id }
      });
      return created;
    });
    return { ok: true, taskId: task.id, alreadyCreated: false };
  } catch (error) {
    if ((error as { code?: string }).code !== 'P2002') throw error;
    const prior = await prisma.telegramAiTaskApproval.findUnique({ where: { id: approvalId } });
    if (!prior || prior.userId !== userId) throw error;
    return { ok: true, taskId: prior.taskId, alreadyCreated: true };
  }
}
