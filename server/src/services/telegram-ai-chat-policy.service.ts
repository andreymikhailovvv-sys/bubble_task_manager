import { prisma } from '../db/prisma.js';
import { FixedWindowRateLimiter } from '../lib/security-rate-limiter.js';
import { parseTelegramSendTargetId } from './telegram-send-targets.service.js';
import { telegramUserChatCapability } from './telegram-user-client-chat-access.service.js';
import { telegramUserClientRead } from './telegram-user-client-read.service.js';
import { TelegramUserClientError } from './telegram-user-client-auth.service.js';
import { monitorDayKey } from './telegram-ai-monitor-worker.service.js';

// PR1 has no worker and NO autonomous Telegram access. Configuration is not
// approval to start reading or writing. PR2 must implement an explicit activation.
const MAX_CHATS = 25;
const saveLimiter = new FixedWindowRateLimiter(20, 60_000);
const MODES = ['OBSERVE', 'SUGGEST', 'AUTO'] as const;
const TASK_MODES = ['NONE', 'SUGGEST', 'AUTO'] as const;
const INTERVALS = [5, 30, 180] as const;
export const TELEGRAM_AI_MONITOR_MODELS = ['gpt-6-luna', 'gpt-5.4-mini', 'gpt-6.1-sol'] as const;
// Exact values exposed by the fixed-step budget slider. NULL = no daily cap.
export const TELEGRAM_AI_DAILY_CREDIT_TIERS_MILLI = [
  50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, null
] as const;

export type TelegramAiChatSettings = {
  mode: typeof MODES[number];
  taskMode: typeof TASK_MODES[number];
  checkIntervalMinutes: typeof INTERVALS[number];
  monitorModel: typeof TELEGRAM_AI_MONITOR_MODELS[number];
  instructions: string;
  notifyImportant: boolean;
  reviewAttachments: boolean;
  dailyCreditLimitMilli: number | null;
};

export const DEFAULT_TELEGRAM_AI_CHAT_SETTINGS: TelegramAiChatSettings = {
  mode: 'OBSERVE',
  taskMode: 'SUGGEST',
  checkIntervalMinutes: 30,
  monitorModel: 'gpt-6-luna',
  instructions: '',
  notifyImportant: true,
  reviewAttachments: true,
  dailyCreditLimitMilli: 50_000
};

const oneOf = <T extends string | number>(value: unknown, choices: readonly T[], field: string): T => {
  if (!choices.includes(value as T)) {
    throw new TelegramUserClientError(400, 'Недопустимое значение: ' + field);
  }
  return value as T;
};

/** Strict full payload: no hidden flags and no client-supplied identity or activation. */
export function validateTelegramAiChatSettings(payload: unknown): TelegramAiChatSettings {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TelegramUserClientError(400, 'Укажите настройки Telegram-ассистента');
  }
  const p = payload as Record<string, unknown>;
  if (typeof p.instructions !== 'string' || p.instructions.length > 3000 ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(p.instructions)) {
    throw new TelegramUserClientError(400, 'Инструкции должны быть текстом до 3000 символов');
  }
  if (p.reviewAttachments !== undefined && typeof p.reviewAttachments !== 'boolean') {
    throw new TelegramUserClientError(400, 'Настройка просмотра вложений должна быть логическим значением');
  }
  if (typeof p.notifyImportant !== 'boolean') {
    throw new TelegramUserClientError(400, 'Настройка уведомлений должна быть логическим значением');
  }
  if (!TELEGRAM_AI_DAILY_CREDIT_TIERS_MILLI.some(tier => tier === p.dailyCreditLimitMilli)) {
    throw new TelegramUserClientError(400, 'Выберите дневной лимит из предложенных значений');
  }
  return {
    mode: oneOf(p.mode, MODES, 'режим работы'),
    taskMode: oneOf(p.taskMode, TASK_MODES, 'добавление задач'),
    checkIntervalMinutes: oneOf(p.checkIntervalMinutes, INTERVALS, 'интенсивность проверки'),
    monitorModel: oneOf(p.monitorModel, TELEGRAM_AI_MONITOR_MODELS, 'модель мониторинга'),
    instructions: p.instructions.trim(),
    notifyImportant: p.notifyImportant,
    reviewAttachments: p.reviewAttachments !== false,
    dailyCreditLimitMilli: p.dailyCreditLimitMilli as number | null
  };
}

function validateTargetId(chatId: unknown): string {
  if (!parseTelegramSendTargetId(chatId)) {
    throw new TelegramUserClientError(400, 'Выберите реальную переписку из списка Telegram');
  }
  return chatId as string;
}

export const telegramAiChatPolicyService = {
  async list(userId: string) {
    const [policies, owner] = await Promise.all([
      prisma.telegramAiChatPolicy.findMany({
        where: { userId }, orderBy: { updatedAt: 'desc' }, take: MAX_CHATS
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } })
    ]);
    const dayKey = monitorDayKey(new Date(), owner?.timeZone);
    return {
      policies: policies.map(policy => ({
        ...policy, spentTodayMilli: policy.creditDayKey === dayKey ? policy.dailySpentMilli : 0,
        reservedTodayMilli: policy.creditDayKey === dayKey ? policy.dailyReservedMilli : 0
      })),
      activationAvailable: true, maximumChats: MAX_CHATS
    };
  },

  async save(userId: string, chatIdInput: unknown, payload: unknown) {
    if (!saveLimiter.consume(userId).allowed) {
      throw new TelegramUserClientError(429, 'Слишком много изменений настроек Telegram');
    }
    const chatId = validateTargetId(chatIdInput);
    const settings = validateTelegramAiChatSettings(payload);
    const capability = await telegramUserChatCapability(userId);
    if (!capability.connected || !capability.readEnabled) {
      throw new TelegramUserClientError(403, 'Для настройки сначала подключите личный Telegram и разрешите чтение');
    }

    // Selecting the chat in the browser is NOT authority. Verify the actual
    // current peer type and ID against this owner's MTProto dialog list.
    const { dialogs } = await telegramUserClientRead.listSendTargets(userId);
    const target = dialogs.find(dialog => dialog.id === chatId);
    if (!target || target.kind !== parseTelegramSendTargetId(chatId)?.kind) {
      throw new TelegramUserClientError(404, 'Выбранный чат недоступен в вашем Telegram');
    }
    const current = await prisma.telegramAiChatPolicy.findUnique({
      where: { userId_chatId: { userId, chatId } },
      select: { id: true }
    });
    if (!current) {
      const count = await prisma.telegramAiChatPolicy.count({ where: { userId } });
      if (count >= MAX_CHATS) throw new TelegramUserClientError(400, 'Достигнут лимит 25 переписок');
    }

    // If the Telegram connection is revoked during network I/O, deny saving.
    const fresh = await telegramUserChatCapability(userId);
    if (!fresh.connected || !fresh.readEnabled) {
      throw new TelegramUserClientError(403, 'Telegram был отключён во время сохранения');
    }
    const policy = await prisma.telegramAiChatPolicy.upsert({
      where: { userId_chatId: { userId, chatId } },
      create: {
        userId, chatId, chatKind: target.kind, chatTitle: target.name,
        ...settings,
        isEnabled: false
      },
      update: {
        chatKind: target.kind, chatTitle: target.name,
        ...settings,
        isEnabled: false, monitorRevision: { increment: 1 },
        leaseToken: null, leasedUntil: null, nextCheckAt: null,
        summaryRequested: false
      }
    });
    return { policy, activationAvailable: true };
  },

  async remove(userId: string, chatIdInput: unknown) {
    const chatId = validateTargetId(chatIdInput);
    // Deleting a policy must remain possible if the Telegram session is lost.
    await prisma.telegramAiChatPolicy.deleteMany({ where: { userId, chatId } });
    return { ok: true };
  }
};
