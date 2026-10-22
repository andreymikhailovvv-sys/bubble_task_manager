import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { encryptTelegramQuickShare, decryptTelegramQuickShare } from '../lib/telegram-quick-share-crypto.js';
import { isTelegramUserReadEnabled } from './telegram-user-client-read.service.js';
import { parseTelegramSendTargetId, telegramSendTargetFromDialog } from './telegram-send-targets.service.js';
import { connectedOwner, openClient, checkManualTelegramSendWindow } from './telegram-user-client-send.service.js';
import { isTelegramAiDraftEnabled } from './telegram-user-client-draft.service.js';
import { isManualTelegramSendingEnabled } from './telegram-user-client-send.service.js';
import { TelegramUserClientError } from './telegram-user-client-auth.service.js';
import { rewriteTelegramQuickText, splitQuickText, validateQuickInstruction, validateQuickText } from './telegram-quick-share-ai.service.js';

export type QuickSendMode = 'DIRECT' | 'REWRITE_AND_SEND';
type Payload = { recipientIds: string[]; text: string; instruction: string | null; mode: QuickSendMode };
export const TELEGRAM_SAVED_MESSAGES_ID = 'saved';
const MAX_SELECTED = 3;
const LEASE_MS = 180_000;
let draining = false;

export function validateQuickRecipients(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SELECTED) {
    throw new TelegramUserClientError(400, 'Выберите от одного до трёх получателей');
  }
  const result: string[] = [];
  for (const id of value) {
    if (typeof id !== 'string' || (id !== TELEGRAM_SAVED_MESSAGES_ID && !parseTelegramSendTargetId(id)) || result.includes(id)) {
      throw new TelegramUserClientError(400, 'Выберите разных людей или беседы из списка Telegram');
    }
    result.push(id);
  }
  return result;
}
export function validateQuickSendInput(input: {
  recipientIds: unknown; text: unknown; instruction?: unknown; mode: unknown; requestId: unknown
}): Payload & { requestId: string } {
  if (input.mode !== 'DIRECT' && input.mode !== 'REWRITE_AND_SEND') {
    throw new TelegramUserClientError(400, 'Неизвестный способ отправки');
  }
  if (typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId)) {
    throw new TelegramUserClientError(400, 'Некорректный идентификатор отправки');
  }
  return {
    requestId: input.requestId.toLowerCase(),
    mode: input.mode,
    recipientIds: validateQuickRecipients(input.recipientIds),
    text: validateQuickText(input.text),
    instruction: input.mode === 'REWRITE_AND_SEND' ? validateQuickInstruction(input.instruction) : null
  };
}

function publicStatus(job: { id: string; state: string; stage: string; recipientCount: number; sentCount: number; rewriteCreditsSpentMilli: number; unknownCount: number; failedCount: number; createdAt: Date; completedAt: Date | null }) {
  return { id: job.id, state: job.state, stage: job.stage, recipientCount: job.recipientCount,
    sentCount: job.sentCount, rewriteCreditsSpentMilli: job.rewriteCreditsSpentMilli, unknownCount: job.unknownCount, failedCount: job.failedCount,
    createdAt: job.createdAt, completedAt: job.completedAt };
}

async function failJob(jobId: string, message: string) {
  console.warn('[TelegramQuickShare] job ended without send', { jobId, category: message });
  await prisma.telegramQuickSendJob.updateMany({
    where: { id: jobId, state: 'PROCESSING' },
    data: { state: 'FAILED', completedAt: new Date(), encryptedPayload: null }
  });
}

async function finishRecipient(job: { id: string; recipientIndex: number; recipientCount: number }, result: 'SENT' | 'FAILED' | 'UNKNOWN') {
  const done = job.recipientIndex + 1 >= job.recipientCount;
  await prisma.telegramQuickSendJob.updateMany({
    where: { id: job.id, state: 'PROCESSING', recipientIndex: job.recipientIndex },
    data: {
      recipientIndex: { increment: 1 },
      ...(result === 'SENT' ? { sentCount: { increment: 1 } } :
        result === 'FAILED' ? { failedCount: { increment: 1 } } :
        { unknownCount: { increment: 1 } }),
      state: done ? 'DONE' : 'QUEUED',
      nextRunAt: new Date(Date.now() + 1_000),
      ...(done ? { completedAt: new Date(), encryptedPayload: null } : { claimedAt: null })
    }
  });
}

async function postpone(jobId: string, seconds: number) {
  await prisma.telegramQuickSendJob.updateMany({
    where: { id: jobId, state: 'PROCESSING' },
    data: { state: 'QUEUED', claimedAt: null, nextRunAt: new Date(Date.now() + Math.min(86_400, Math.max(1, seconds)) * 1000) }
  });
}

async function claimAudit(userId: string, recipientId: string, auditId: string, accountId: string, kind: 'saved' | 'dialog' | 'group' | 'supergroup') {
  const existing = await prisma.telegramUserClientSendAudit.findUnique({ where: { id: auditId } });
  if (existing) {
    // A previous worker may have crashed after remote delivery. The ledger
    // is authoritative: never call sendMessage for an existing attempt.
    if (existing.result === 'PENDING') {
      await prisma.telegramUserClientSendAudit.updateMany({
        where: { id: auditId, result: 'PENDING' },
        data: { result: 'UNKNOWN', completedAt: new Date() }
      });
      return { kind: 'existing' as const, result: 'UNKNOWN' as const };
    }
    return { kind: 'existing' as const, result: existing.result === 'SENT' ? 'SENT' as const :
      existing.result === 'FAILED' ? 'FAILED' as const : 'UNKNOWN' as const };
  }
  return prisma.$transaction(async tx => {
    const owner = await tx.user.findUnique({
      where: { id: userId }, select: {
        telegramChatId: true, telegramUserClientConnection: {
          select: { pilotEnabled: true, encryptedSession: true, encryptedApiCredentials: true, telegramAccountId: true, connectedAt: true }
        }
      }
    });
    const c = owner?.telegramUserClientConnection;
    if (!isManualTelegramSendingEnabled() || !isTelegramUserReadEnabled() ||
      !c?.pilotEnabled || !c.encryptedSession || !c.encryptedApiCredentials || !c.connectedAt ||
      c.telegramAccountId !== accountId || owner?.telegramChatId !== accountId) {
      throw new TelegramUserClientError(403, 'Доступ Telegram отозван');
    }
    const now = Date.now();
    const recent = await tx.telegramUserClientSendAudit.findMany({
      where: { userId, createdAt: { gte: new Date(now - 24 * 60 * 60_000) } },
      orderBy: { createdAt: 'desc' }, take: 12, select: { createdAt: true }
    });
    const delay = checkManualTelegramSendWindow(recent.map(x => x.createdAt), now);
    if (delay) return { kind: 'delay' as const, seconds: delay };
    await tx.telegramUserClientSendAudit.create({
      data: { id: auditId, userId, recipientKind: kind, recipientTelegramId: recipientId, result: 'PENDING' }
    });
    return { kind: 'new' as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function performJob(job: {
  id: string; userId: string; recipientIndex: number; recipientCount: number; stage: string;
  encryptedPayload: string | null
}) {
  if (!job.encryptedPayload) { await failJob(job.id, 'missing_payload'); return; }
  let payload: Payload;
  try { payload = JSON.parse(decryptTelegramQuickShare(job.encryptedPayload, job.userId, job.id)) as Payload; }
  catch { await failJob(job.id, 'decryption'); return; }
  if (!Array.isArray(payload.recipientIds) || payload.recipientIds.length !== job.recipientCount) {
    await failJob(job.id, 'invalid_recipients'); return;
  }
  if (job.stage === 'REWRITE') {
    try {
      await connectedOwner(job.userId);
      if (!isTelegramAiDraftEnabled()) throw new TelegramUserClientError(403, 'ИИ-обработка выключена');
      const revised = await rewriteTelegramQuickText(job.userId, payload.text, payload.instruction ?? '');
      const encrypted = encryptTelegramQuickShare(JSON.stringify({ ...payload, text: revised.text, instruction: null, mode: 'DIRECT' }), job.userId, job.id);
      await prisma.telegramQuickSendJob.updateMany({
        where: { id: job.id, state: 'PROCESSING', stage: 'REWRITE' },
        data: { encryptedPayload: encrypted, rewriteCreditsSpentMilli: revised.creditsSpentMilli,
          stage: 'SEND', state: 'QUEUED', claimedAt: null, nextRunAt: new Date() }
      });
    } catch { await failJob(job.id, 'ai_rewrite'); }
    return;
  }
  const target = payload.recipientIds[job.recipientIndex];
  if (!target) { await failJob(job.id, 'invalid_index'); return; }
  const fragments = splitQuickText(payload.text);
  if (!fragments.length) { await failJob(job.id, 'invalid_message'); return; }
  // The audit ledger tracks each fragment separately, without new cursors in
  // the database. Confirmed fragments are never re-sent after a worker crash.
  let partIndex = 0;
  for (; partIndex < fragments.length; partIndex++) {
    const partAuditId = `${job.id}:${job.recipientIndex}${partIndex ? ':' + partIndex : ''}`;
    const prior = await prisma.telegramUserClientSendAudit.findUnique({ where: { id: partAuditId } });
    if (!prior) break;
    if (prior.result === 'SENT') continue;
    if (prior.result === 'PENDING') await prisma.telegramUserClientSendAudit.updateMany({
      where: { id: partAuditId, result: 'PENDING' },
      data: { result: 'UNKNOWN', completedAt: new Date() }
    });
    // If delivery is unknown, do not continue with subsequent fragments or
    // repeat the ambiguous fragment. The owner must inspect Telegram manually.
    await finishRecipient(job, prior.result === 'FAILED' ? 'FAILED' : 'UNKNOWN');
    return;
  }
  if (partIndex === fragments.length) { await finishRecipient(job, 'SENT'); return; }
  const auditId = `${job.id}:${job.recipientIndex}${partIndex ? ':' + partIndex : ''}`;

  let client: Awaited<ReturnType<typeof openClient>> | null = null;
  let sendStarted = false;
  let auditClaimed = false;
  try {
    const owner = await connectedOwner(job.userId);
    client = await openClient(owner);
    const saved = target === TELEGRAM_SAVED_MESSAGES_ID;
    // The worker does not resolve arbitrary peer IDs. Every non-Saved
    // recipient must still be a currently available group or private dialog
    // in this exact owner's Telegram list, even after queue delays.
    let inputEntity;
    let recipientKind: 'saved' | 'dialog' | 'group' | 'supergroup';
    if (saved) {
      inputEntity = await client.getInputEntity('me');
      recipientKind = 'saved';
    } else {
      const parsed = parseTelegramSendTargetId(target);
      if (!parsed) {
        await finishRecipient(job, 'FAILED');
        return;
      }
      const rows = await client.getDialogs({ limit: 150, ignoreMigrated: true });
      const dialog = rows.find(row => telegramSendTargetFromDialog(row, owner.telegramAccountId)?.id === target);
      if (!dialog) {
        await finishRecipient(job, 'FAILED');
        return;
      }
      inputEntity = dialog.inputEntity;
      recipientKind = parsed.kind === 'user' ? 'dialog' : parsed.kind;
    }
    const claimed = await claimAudit(job.userId, saved ? owner.telegramAccountId : target, auditId, owner.telegramAccountId, recipientKind);
    if (claimed.kind === 'delay') { await postpone(job.id, claimed.seconds); return; }
    if (claimed.kind === 'existing') { await finishRecipient(job, claimed.result); return; }
    auditClaimed = true;
    // This is the only call that can send the message. The audit claim is
    // durable and single-use before starting the remote side effect.
    sendStarted = true;
    await client.sendMessage(inputEntity, {
      message: fragments[partIndex], formattingEntities: [], linkPreview: false
    });
    await prisma.telegramUserClientSendAudit.updateMany({
      where: { id: auditId, result: 'PENDING' },
      data: { result: 'SENT', completedAt: new Date() }
    });
    if (partIndex + 1 === fragments.length) await finishRecipient(job, 'SENT');
    else await postpone(job.id, 1); // Send the next part after the durable audit commit.
  } catch (error) {
    if (auditClaimed) {
      const result = sendStarted ? 'UNKNOWN' : 'FAILED';
      await prisma.telegramUserClientSendAudit.updateMany({
        where: { id: auditId, result: 'PENDING' },
        data: { result, completedAt: new Date() }
      }).catch(() => undefined);
      await finishRecipient(job, result);
    } else if (error instanceof TelegramUserClientError && error.statusCode === 403) {
      await failJob(job.id, 'permission_revoked');
    } else {
      // Before claiming an audit there is no remote send. A temporary network
      // error can be retried safely, but don't keep a job forever.
      await postpone(job.id, 30);
    }
  } finally {
    if (client) try { await client.disconnect(); } catch { /* no session logs */ }
  }
}

export const telegramQuickShare = {
  async enqueue(userId: string, raw: {
    recipientIds: unknown; text: unknown; instruction?: unknown; mode: unknown; requestId: unknown
  }) {
    const data = validateQuickSendInput(raw);
    await connectedOwner(userId);
    if (!isTelegramUserReadEnabled()) throw new TelegramUserClientError(403, 'Выбор Telegram-диалогов недоступен');
    if (data.mode === 'REWRITE_AND_SEND' && !isTelegramAiDraftEnabled()) {
      throw new TelegramUserClientError(403, 'ИИ-обработка сообщений недоступна');
    }
    const found = await prisma.telegramQuickSendJob.findUnique({ where: { id: data.requestId } });
    if (found) {
      if (found.userId !== userId) throw new TelegramUserClientError(409, 'Идентификатор занят');
      return publicStatus(found);
    }
    const recent = await prisma.telegramQuickSendJob.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - 5 * 60_000) } }
    });
    if (recent >= 6) throw new TelegramUserClientError(429, 'Не более шести запросов отправки за пять минут');
    const payload: Payload = { recipientIds: data.recipientIds, text: data.text,
      instruction: data.instruction, mode: data.mode };
    const encryptedPayload = encryptTelegramQuickShare(JSON.stringify(payload), userId, data.requestId);
    try {
      const job = await prisma.telegramQuickSendJob.create({
        data: { id: data.requestId, userId, state: 'QUEUED',
          stage: data.mode === 'REWRITE_AND_SEND' ? 'REWRITE' : 'SEND',
          recipientCount: data.recipientIds.length, encryptedPayload }
      });
      return publicStatus(job);
    } catch {
      const existing = await prisma.telegramQuickSendJob.findUnique({ where: { id: data.requestId } });
      if (existing?.userId === userId) return publicStatus(existing);
      throw new TelegramUserClientError(409, 'Не удалось зарегистрировать отправку');
    }
  },

  async status(userId: string, jobId: unknown) {
    if (typeof jobId !== 'string' || !/^[0-9a-f-]{36}$/i.test(jobId)) throw new TelegramUserClientError(400, 'Некорректная операция');
    const job = await prisma.telegramQuickSendJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new TelegramUserClientError(404, 'Операция не найдена');
    return publicStatus(job);
  },

  async rewritePreview(userId: string, original: unknown, instruction: unknown) {
    await connectedOwner(userId);
    return rewriteTelegramQuickText(userId, validateQuickText(original), validateQuickInstruction(instruction));
  },

  async drain() {
    if (draining) return;
    draining = true;
    try {
      // Expired claims are recovered: per-recipient audit rows prevent
      // re-sending any Telegram message with unknown remote delivery.
      await prisma.telegramQuickSendJob.updateMany({
        where: { state: 'PROCESSING', claimedAt: { lt: new Date(Date.now() - LEASE_MS) } },
        data: { state: 'QUEUED', claimedAt: null }
      });
      const next = await prisma.telegramQuickSendJob.findFirst({
        where: { state: 'QUEUED', nextRunAt: { lte: new Date() } },
        orderBy: { createdAt: 'asc' }
      });
      if (!next) return;
      const claimed = await prisma.telegramQuickSendJob.updateMany({
        where: { id: next.id, state: 'QUEUED' },
        data: { state: 'PROCESSING', claimedAt: new Date() }
      });
      if (claimed.count === 0) return;
      try { await performJob(next); }
      catch {
        console.warn('[TelegramQuickShare] worker failure', { jobId: next.id });
        await postpone(next.id, 30).catch(() => undefined);
      }
      // No payload or text is persisted after completion.
      await prisma.telegramQuickSendJob.deleteMany({
        where: { completedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60_000) } }
      });
    } finally { draining = false; }
  }
};
