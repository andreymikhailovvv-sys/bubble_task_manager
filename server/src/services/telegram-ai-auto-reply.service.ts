import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { parseTelegramSendTargetId, telegramSendTargetFromDialog } from './telegram-send-targets.service.js';
import { connectedOwner, openClient } from './telegram-user-client-send.service.js';
import { telegramUserChatCapability } from './telegram-user-client-chat-access.service.js';
import { TelegramUserClientError } from './telegram-user-client-auth.service.js';

const MAX_REPLY_CHARS = 1000;
const MAX_AUTO_REPLIES_PER_DAY = 30;
const MAX_AUTO_REPLIES_PER_10_MINUTES = 4;
const MIN_AUTO_REPLY_GAP_MS = 15_000;

/** An LLM cannot authorize sending: this guard is evaluated after the model
 * answers, against current owner-controlled DB policy and an active monitor
 * lease. No chats or message bodies are written into the send audit. */
export async function sendConditionalTelegramAutoReply(input: {
  userId: string; policyId: string; chatId: string;
  messageId: number; text: string; revision: number; leaseToken: string;
}): Promise<'SENT' | 'SKIPPED'> {
  if (!Number.isSafeInteger(input.messageId) || input.messageId <= 0 ||
      !parseTelegramSendTargetId(input.chatId) ||
      typeof input.text !== 'string' || !input.text.trim() ||
      input.text.length > MAX_REPLY_CHARS || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(input.text)) {
    return 'SKIPPED';
  }
  const access = await telegramUserChatCapability(input.userId);
  if (!access.connected || !access.readEnabled || !access.sendEnabled) return 'SKIPPED';
  const active = () => prisma.telegramAiChatPolicy.findFirst({
    where: { id: input.policyId, userId: input.userId, chatId: input.chatId,
      mode: 'AUTO', isEnabled: true, monitorRevision: input.revision,
      leaseToken: input.leaseToken, leasedUntil: { gt: new Date() },
      NOT: [{ autoReplyWhen: '' }, { autoReplyHow: '' }] }
  });

  if (!await active()) return 'SKIPPED';

  // A unique (policy, incoming message) slot prevents duplicate replies after
  // restarts, worker overlap, UI polling, or an ambiguous MTProto timeout.
  let attemptId: string;
  try {
    attemptId = await prisma.$transaction(async tx => {
      // Serialize per-owner rate decisions with the user row lock.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
      const policy = await tx.telegramAiChatPolicy.findFirst({
        where: { id: input.policyId, userId: input.userId, chatId: input.chatId,
          mode: 'AUTO', isEnabled: true, monitorRevision: input.revision,
          leaseToken: input.leaseToken, leasedUntil: { gt: new Date() },
          NOT: [{ autoReplyWhen: '' }, { autoReplyHow: '' }] },
        select: { id: true }
      });
      if (!policy) throw new TelegramUserClientError(409, 'Автоответы выключены');
      const now = Date.now();
      const recent = await tx.telegramAiAutoReplyAttempt.findMany({
        where: { policy: { userId: input.userId },
          createdAt: { gte: new Date(now - 24 * 60 * 60_000) } },
        orderBy: { createdAt: 'desc' }, take: MAX_AUTO_REPLIES_PER_DAY,
        select: { createdAt: true, status: true }
      });
      const sent = recent.filter(row => row.status !== 'FAILED');
      if (sent.length >= MAX_AUTO_REPLIES_PER_DAY ||
          sent.filter(row => row.createdAt.getTime() > now - 10 * 60_000).length >= MAX_AUTO_REPLIES_PER_10_MINUTES ||
          (sent.length > 0 && sent[0].createdAt.getTime() + MIN_AUTO_REPLY_GAP_MS > now)) {
        throw new TelegramUserClientError(429, 'Лимит частоты автоответов');
      }
      const attempt = await tx.telegramAiAutoReplyAttempt.create({
        data: { policyId: input.policyId, messageId: input.messageId, status: 'CLAIMED' }
      });
      return attempt.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch {
    // Unique constraint, conflict and rate cap are terminal for this message.
    // Never requeue an uncertain external send.
    return 'SKIPPED';
  }

  let started = false;
  let client: Awaited<ReturnType<typeof openClient>> | null = null;
  try {
    const owner = await connectedOwner(input.userId);
    client = await openClient(owner);
    const dialogs = await client.getDialogs({ limit: 150, ignoreMigrated: true });
    const row = dialogs.find(dialog =>
      telegramSendTargetFromDialog(dialog, owner.telegramAccountId)?.id === input.chatId);
    const target = row && telegramSendTargetFromDialog(row, owner.telegramAccountId);
    if (!row || !target || target.kind !== parseTelegramSendTargetId(input.chatId)?.kind) {
      throw new TelegramUserClientError(404, 'Разрешённая переписка Telegram недоступна');
    }
    // Recheck revocation and policy immediately before the irreversible call.
    const fresh = await connectedOwner(input.userId);
    const permission = await telegramUserChatCapability(input.userId);
    if (!permission.readEnabled || !permission.sendEnabled ||
        fresh.telegramAccountId !== owner.telegramAccountId ||
        fresh.encryptedSession !== owner.encryptedSession || !await active()) {
      throw new TelegramUserClientError(409, 'Доступ к автоответам изменён');
    }
    await prisma.telegramAiAutoReplyAttempt.update({
      where: { id: attemptId }, data: { status: 'SENDING' }
    });
    started = true;
    // No retries once outbound I/O starts, even if the response is a timeout.
    // Reply in the exact owner-authorized dialog, anchored to triggering ID.
    await client.sendMessage(row.inputEntity, {
      message: input.text.trim(), replyTo: input.messageId,
      formattingEntities: [], linkPreview: false
    });
    await prisma.telegramAiAutoReplyAttempt.updateMany({
      where: { id: attemptId, status: 'SENDING' },
      data: { status: 'SENT', completedAt: new Date() }
    });
    console.info('[TelegramAutoReply] sent', { policyId: input.policyId, messageId: input.messageId });
    return 'SENT';
  } catch {
    await prisma.telegramAiAutoReplyAttempt.updateMany({
      where: { id: attemptId },
      data: { status: started ? 'UNKNOWN' : 'FAILED', completedAt: new Date() }
    }).catch(() => {});
    console.warn('[TelegramAutoReply] delivery ended', {
      policyId: input.policyId, messageId: input.messageId, outcome: started ? 'UNKNOWN' : 'FAILED'
    });
    return 'SKIPPED';
  } finally {
    if (client) try { await client.disconnect(); } catch { /* best effort */ }
  }
}
