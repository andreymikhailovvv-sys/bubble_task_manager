import { randomUUID } from 'node:crypto';
import { Prisma, type TelegramAiChatPolicy, type TelegramAiMonitorCall } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { FixedWindowRateLimiter } from '../lib/security-rate-limiter.js';
import { refundAiCreditReservation, reserveAiCreditsMilliWithTransaction, settleAiCreditReservation, type AiCreditReservation } from './ai-credit-wallet.service.js';
import { recordAiCreditCharge } from './ai-usage-metering.service.js';
import { telegramUserChatCapability } from './telegram-user-client-chat-access.service.js';
import { telegramUserClientRead } from './telegram-user-client-read.service.js';
import { TelegramUserClientError } from './telegram-user-client-auth.service.js';
import { analyzeMonitorMessages, buildMonitorPayload, countMonitorInputTokens, TELEGRAM_MONITOR_FEATURE, TELEGRAM_MONITOR_MODEL, type MonitorSummary } from './telegram-ai-monitor-summary.service.js';

const LEASE_MS = 10 * 60_000;
const STALE_CALL_MS = 12 * 60_000;
const MAX_JOBS_PER_TICK = 3;
const requestedSummaries = new FixedWindowRateLimiter(4, 15 * 60_000);
const MAX_INPUT_MESSAGES = 40;

export function monitorDayKey(now: Date, timeZone: string | null | undefined): string {
  let zone = timeZone || 'Europe/Moscow';
  try { Intl.DateTimeFormat('en-US', { timeZone: zone }).format(now); }
  catch { zone = 'Europe/Moscow'; }
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(now);
  const take = (part: string) => parts.find(value => value.type === part)?.value ?? '';
  return `${take('year')}-${take('month')}-${take('day')}`;
}

export function availableMonitorBudget(limitMilli: number | null, spentMilli: number, reservedMilli: number): number | null {
  if (limitMilli === null) return null;
  return Math.max(0, limitMilli - spentMilli - reservedMilli);
}

async function permission(userId: string) {
  const access = await telegramUserChatCapability(userId);
  if (!access.connected || !access.readEnabled) {
    throw new TelegramUserClientError(403, 'Личный Telegram недоступен для мониторинга');
  }
}

/** Activation is explicit and starts from the newest Telegram message, not historic content. */
export const telegramAiMonitorControl = {
  async start(userId: string, chatId: string) {
    const policy = await prisma.telegramAiChatPolicy.findUnique({ where: { userId_chatId: { userId, chatId } } });
    if (!policy) throw new TelegramUserClientError(404, 'Настройки переписки не найдены');
    await permission(userId);
    // Fetch latest metadata/text locally through existing verified owner reader.
    // The result is not sent to an AI. It only supplies an initial checkpoint.
    const history = await telegramUserClientRead.aiHistory(userId, chatId, 10, true);
    const maxId = Math.max(0, ...history.messages.map(item => item.id));
    await permission(userId);
    const current = await prisma.telegramAiChatPolicy.updateMany({
      where: { id: policy.id, userId, isEnabled: false, monitorRevision: policy.monitorRevision },
      data: {
        isEnabled: true, monitorRevision: { increment: 1 },
        lastSeenMessageId: maxId, lastCheckedAt: new Date(),
        nextCheckAt: new Date(Date.now() + policy.checkIntervalMinutes * 60_000),
        lastError: null, leaseToken: null, leasedUntil: null, summaryRequested: false
      }
    });
    if (!current.count) throw new TelegramUserClientError(409, 'Настройки были изменены; обновите страницу');
    return { ok: true, enabled: true };
  },
  async stop(userId: string, chatId: string) {
    const result = await prisma.telegramAiChatPolicy.updateMany({
      where: { userId, chatId },
      data: { isEnabled: false, monitorRevision: { increment: 1 }, leaseToken: null, leasedUntil: null, nextCheckAt: null, summaryRequested: false }
    });
    if (!result.count) throw new TelegramUserClientError(404, 'Настройки переписки не найдены');
    return { ok: true, enabled: false };
  },
  async requestSummary(userId: string, chatId: string) {
    if (!requestedSummaries.consume(userId).allowed) throw new TelegramUserClientError(429, 'Слишком много запросов сводки');
    const result = await prisma.telegramAiChatPolicy.updateMany({
      where: { userId, chatId, isEnabled: true },
      data: { summaryRequested: true, nextCheckAt: new Date() }
    });
    if (!result.count) throw new TelegramUserClientError(409, 'Сначала включите мониторинг переписки');
    return { ok: true, queued: true };
  }
};

type Claimed = { policy: TelegramAiChatPolicy; token: string };

async function claim(): Promise<Claimed | null> {
  const now = new Date();
  const candidate = await prisma.telegramAiChatPolicy.findFirst({
    where: {
      isEnabled: true,
      nextCheckAt: { lte: now },
      OR: [{ leasedUntil: null }, { leasedUntil: { lt: now } }]
    },
    orderBy: { nextCheckAt: 'asc' }
  });
  if (!candidate) return null;
  const token = randomUUID();
  const result = await prisma.telegramAiChatPolicy.updateMany({
    where: {
      id: candidate.id, isEnabled: true, monitorRevision: candidate.monitorRevision,
      nextCheckAt: { lte: now },
      OR: [{ leasedUntil: null }, { leasedUntil: { lt: now } }]
    },
    data: { leaseToken: token, leasedUntil: new Date(now.getTime() + LEASE_MS) }
  });
  return result.count ? { policy: candidate, token } : null;
}

async function release(claimed: Claimed, error: string | null = null) {
  await prisma.telegramAiChatPolicy.updateMany({
    where: { id: claimed.policy.id, leaseToken: claimed.token },
    data: {
      leaseToken: null, leasedUntil: null,
      nextCheckAt: new Date(Date.now() + claimed.policy.checkIntervalMinutes * 60_000),
      lastCheckedAt: new Date(),
      ...(error ? { lastError: error.slice(0, 160) } : { lastError: null })
    }
  });
}

async function ownedLease(claimed: Claimed) {
  const current = await prisma.telegramAiChatPolicy.findFirst({
    where: {
      id: claimed.policy.id, userId: claimed.policy.userId, isEnabled: true,
      leaseToken: claimed.token, monitorRevision: claimed.policy.monitorRevision, leasedUntil: { gt: new Date() }
    }
  });
  if (!current) throw new TelegramUserClientError(409, 'Мониторинг остановлен или настройки изменились');
  await permission(current.userId);
  return current;
}

function reservationFromRecord(row: {
  id: string; userId: string; period: string; includedMilli: number;
  bonusMilli: number; purchasedMilli: number; totalMilli: number
}): AiCreditReservation {
  return { ...row };
}

/** Billing calls are recoverable after an application restart, without replaying OpenAI. */
async function completeCall(call: TelegramAiMonitorCall, chargedMilli: number) {
  await prisma.$transaction(async tx => {
    const done = await tx.telegramAiMonitorCall.updateMany({
      where: { id: call.id, state: { in: ['RESERVED', 'STARTED'] } },
      data: { state: chargedMilli > 0 ? 'SETTLED' : 'REFUNDED', chargedMilli, completedAt: new Date() }
    });
    if (!done.count || !call.policyId) return;
    const current = await tx.telegramAiChatPolicy.findUnique({ where: { id: call.policyId } });
    if (!current) return;
    await tx.telegramAiChatPolicy.update({
      where: { id: current.id },
      data: {
        dailyReservedMilli: current.creditDayKey === call.creditDayKey ? { decrement: Math.min(current.dailyReservedMilli, call.reservedMilli) } : undefined,
        dailySpentMilli: current.creditDayKey === call.creditDayKey ? { increment: chargedMilli } : undefined,
        totalSpentMilli: { increment: chargedMilli }
      }
    });
  });
}

async function ensureChargeRecorded(call: TelegramAiMonitorCall, amountMilli: number) {
  if (amountMilli <= 0) return;
  const eventId = 'telegram-monitor-charge:' + call.id;
  await recordAiCreditCharge({
    eventId, userId: call.userId, requestId: call.id + ':charge',
    actionId: call.id, providerCallIndex: 1,
    feature: TELEGRAM_MONITOR_FEATURE, model: TELEGRAM_MONITOR_MODEL,
    creditsSpentMilli: amountMilli
  });
  // The shared recorder deliberately swallows transient event-write failures.
  // Verify the durable event before closing the billing ledger, so reconciliation
  // can retry without double-counting spend.
  const saved = await prisma.aiUsageEvent.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!saved) throw new Error('Could not persist Telegram AI credit charge');
}

async function reconcileStaleCalls() {
  const calls = await prisma.telegramAiMonitorCall.findMany({
    where: { state: { in: ['RESERVED', 'STARTED'] }, createdAt: { lt: new Date(Date.now() - STALE_CALL_MS) } },
    take: 10
  });
  for (const call of calls) {
    try {
      const row = await prisma.aiCreditReservationRecord.findUnique({ where: { id: call.reservationId } });
      if (!row) continue;
      if (row.status === 'RESERVED') {
        // An interrupted provider call has an unknown outcome. Never silently
        // retry or bill an estimate as though it were a verified token usage.
        await refundAiCreditReservation(reservationFromRecord(row));
      }
      const saved = await prisma.aiCreditReservationRecord.findUnique({ where: { id: call.reservationId } });
      const charged = saved?.status === 'SETTLED' ? saved.chargedMilli : 0;
      await ensureChargeRecorded(call, charged);
      await completeCall(call, charged);
    } catch {
      console.warn('[TelegramMonitor] stale billing reconciliation failed', { callId: call.id });
    }
  }
}

async function reserveForCall(claimed: Claimed, desired: number, dayKey: string) {
  const { policy } = claimed;
  const callId = randomUUID();
  const { reservation } = await reserveAiCreditsMilliWithTransaction(policy.userId, desired, async (tx, reserved) => {
      const rows = await tx.$queryRaw<Array<{
        id: string; isEnabled: boolean; monitorRevision: number; leaseToken: string | null;
        creditDayKey: string | null; dailySpentMilli: number; dailyReservedMilli: number; dailyCreditLimitMilli: number | null
      }>>(Prisma.sql`
        SELECT "id", "isEnabled", "monitorRevision", "leaseToken", "creditDayKey",
               "dailySpentMilli", "dailyReservedMilli", "dailyCreditLimitMilli"
        FROM "TelegramAiChatPolicy" WHERE "id" = ${policy.id} FOR UPDATE
      `);
      const row = rows[0];
      if (!row || !row.isEnabled || row.leaseToken !== claimed.token || row.monitorRevision !== policy.monitorRevision) {
        throw new TelegramUserClientError(409, 'Мониторинг был остановлен');
      }
      const spent = row.creditDayKey === dayKey ? row.dailySpentMilli : 0;
      const reserved = row.creditDayKey === dayKey ? row.dailyReservedMilli : 0;
      const remaining = availableMonitorBudget(row.dailyCreditLimitMilli, spent, reserved);
      if (remaining !== null && desired > remaining) {
        throw new TelegramUserClientError(402, 'Дневной лимит кредитов для переписки достигнут');
      }
      await tx.telegramAiChatPolicy.update({
        where: { id: policy.id },
        data: {
          creditDayKey: dayKey, dailySpentMilli: spent,
          dailyReservedMilli: reserved + desired
        }
      });
      await tx.telegramAiMonitorCall.create({
        data: { id: callId, policyId: policy.id, userId: policy.userId,
          reservationId: reserved.id, creditDayKey: dayKey, reservedMilli: desired }
      });
  });
  return { reservation, callId };
}

async function notifyImportant(policy: TelegramAiChatPolicy, messageId: number, summary: MonitorSummary) {
  if (!policy.notifyImportant || !summary.important) return;
  const preview = (summary.risks[0] || summary.obligations[0] || summary.decisions[0] || summary.summary).slice(0, 180);
  await prisma.systemNotification.create({
    data: {
      userId: policy.userId,
      eventKey: `telegram-monitor:${policy.id}:${messageId}`,
      content: `Telegram · ${policy.chatTitle.slice(0, 60)}: ${preview}`
    }
  }).catch(error => {
    if ((error as { code?: string }).code !== 'P2002') {
      console.warn('[TelegramMonitor] notification failed', { policyId: policy.id });
    }
  });
}

async function processClaim(claimed: Claimed) {
  const { policy } = claimed;
  await ownedLease(claimed);
  const latest = await telegramUserClientRead.aiHistory(policy.userId, policy.chatId, 100, true);
  const lastSeen = policy.lastSeenMessageId ?? 0;
  const all = latest.messages;
  const maxId = Math.max(lastSeen, ...all.map(m => m.id));
  const newMessages = all.filter(m => m.id > lastSeen);
  const selected = newMessages.length
    ? newMessages.slice(-MAX_INPUT_MESSAGES)
    : policy.summaryRequested ? all.slice(-Math.min(30, MAX_INPUT_MESSAGES)) : [];
  if (!selected.length || !selected.some(m => m.text.trim())) {
    await prisma.telegramAiChatPolicy.updateMany({
      where: { id: policy.id, leaseToken: claimed.token, monitorRevision: policy.monitorRevision, isEnabled: true },
      data: { lastSeenMessageId: maxId, summaryRequested: false }
    });
    return;
  }

  // Bound the context even when 100 messages are requested from Telegram.
  const bounded = selected.map(m => ({ ...m, text: m.text.slice(0, 500) }));
  // Do not send data to OpenAI when the owner disconnects or revokes a policy.
  const current = await ownedLease(claimed);
  const user = await prisma.user.findUnique({ where: { id: policy.userId }, select: { timeZone: true } });
  const dayKey = monitorDayKey(new Date(), user?.timeZone);
  const previousSummary = current.lastSummary && typeof current.lastSummary === 'object' ? current.lastSummary as unknown as MonitorSummary : null;
  const instructions = current.instructions;
  const payload = buildMonitorPayload(bounded, instructions, current.taskMode, previousSummary);
  const desired = await countMonitorInputTokens(payload);
  if (desired <= 0) throw new Error('Invalid monitor maximum cost');
  const { reservation, callId } = await reserveForCall(claimed, desired, dayKey);
  let billed = false;
  try {
    await ownedLease(claimed);
    // Mark the batch as consumed before any provider I/O. Crashes must never
    // result in an automatic second LLM request for the same message IDs.
    const advance = await prisma.telegramAiChatPolicy.updateMany({
      where: { id: policy.id, isEnabled: true, monitorRevision: policy.monitorRevision, leaseToken: claimed.token },
      data: { lastSeenMessageId: maxId, summaryRequested: false }
    });
    if (!advance.count) throw new TelegramUserClientError(409, 'Мониторинг остановлен');
    await prisma.telegramAiMonitorCall.update({ where: { id: callId }, data: { state: 'STARTED' } });
    const result = await analyzeMonitorMessages({
      userId: policy.userId, requestId: callId, messages: bounded, instructions, taskMode: current.taskMode, previousSummary
    });
    const settlement = await settleAiCreditReservation(reservation, result.actualMilli);
    billed = true;
    const call = await prisma.telegramAiMonitorCall.findUnique({ where: { id: callId } });
    if (call) {
      await ensureChargeRecorded(call, settlement.chargedMilli);
      await completeCall(call, settlement.chargedMilli);
    }
    const updated = await prisma.telegramAiChatPolicy.updateMany({
      where: { id: policy.id, isEnabled: true, monitorRevision: policy.monitorRevision, leaseToken: claimed.token },
      data: { lastSummary: result.summary as unknown as Prisma.InputJsonValue, lastSummaryAt: new Date(), lastError: null }
    });
    if (updated.count) await notifyImportant(policy, maxId, result.summary);
  } catch (error) {
    if (!billed) {
      await refundAiCreditReservation(reservation);
      const call = await prisma.telegramAiMonitorCall.findUnique({ where: { id: callId } });
      if (call) await completeCall(call, 0);
    }
    throw error;
  }
}

class TelegramAiMonitorWorker {
  private running = false;

  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      await reconcileStaleCalls();
      for (let i = 0; i < MAX_JOBS_PER_TICK; i++) {
        const claimed = await claim();
        if (!claimed) break;
        try { await processClaim(claimed); await release(claimed); }
        catch (error) {
          const safe = error instanceof TelegramUserClientError ? error.message.slice(0, 150) :
            'Ошибка обработки Telegram. Следующая проверка по расписанию.';
          await release(claimed, safe);
          console.warn('[TelegramMonitor] worker attempt failed', {
            policyId: claimed.policy.id, code: error instanceof TelegramUserClientError ? error.statusCode : 'INTERNAL'
          });
        }
      }
    } finally { this.running = false; }
  }
}
export const telegramAiMonitorWorker = new TelegramAiMonitorWorker();
