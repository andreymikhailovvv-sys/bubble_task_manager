import { prisma } from '../db/prisma.js';
import { FixedWindowRateLimiter } from '../lib/security-rate-limiter.js';
import { parseTelegramSendTargetId } from './telegram-send-targets.service.js';
import { telegramUserChatCapability } from './telegram-user-client-chat-access.service.js';
import { telegramUserClientRead } from './telegram-user-client-read.service.js';
import { TelegramUserClientError } from './telegram-user-client-auth.service.js';
import { monitorDayKey } from './telegram-ai-monitor-worker.service.js';

// Each policy is explicitly activated after the owner saves the selected chat.
// Revocation disables all three independent monitoring schedules.
const MAX_CHATS = 25;
const saveLimiter = new FixedWindowRateLimiter(20, 60_000);
const MODES = ['OBSERVE', 'SUGGEST', 'AUTO'] as const;
const TASK_MODES = ['NONE', 'SUGGEST', 'AUTO'] as const;
export const TELEGRAM_AI_INTERVALS = [0, 5, 10, 30, 180, 360, 1440] as const;
export const TELEGRAM_AI_SUMMARY_INTERVALS = [-1, 0, 5, 10, 30, 180, 360, 1440] as const;
export const TELEGRAM_AI_CUSTOM_MAX_MINUTES = 5_256_000; // up to ten 365-day years
export const TELEGRAM_AI_CUSTOM_MAX_MONTHS = 120;
export const TELEGRAM_AI_CUSTOM_MAX_CREDIT_MILLI = 100_000_000; // 100,000 credits
export const TELEGRAM_AI_MONITOR_MODELS = ['gpt-6-luna', 'gpt-5.4-mini', 'gpt-6.1-sol'] as const;
// Exact values exposed by the fixed-step budget slider. NULL = no daily cap.
export const TELEGRAM_AI_DAILY_CREDIT_TIERS_MILLI = [
  50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, null
] as const;

export type TelegramAiChatSettings = {
  mode: typeof MODES[number];
  taskMode: typeof TASK_MODES[number];
  taskCreationWhen: string;
  taskIntervalMinutes: number;
  taskIntervalMonths: number | null;
  interactionIntervalMinutes: typeof TELEGRAM_AI_INTERVALS[number];
  autoReplyIntervalMinutes: number;
  autoReplyIntervalMonths: number | null;
  summaryIntervalMinutes: number;
  summaryIntervalMonths: number | null;
  summaryInstructions: string;
  suggestWhen: string;
  suggestHow: string;
  monitorModel: typeof TELEGRAM_AI_MONITOR_MODELS[number];
  autoReplyWhen: string;
  autoReplyHow: string;
  notifyImportant: boolean;
  reviewAttachments: boolean;
  dailyCreditLimitMilli: number | null;
};

export const DEFAULT_TELEGRAM_AI_CHAT_SETTINGS: TelegramAiChatSettings = {
  mode: 'OBSERVE',
  taskMode: 'SUGGEST',
  taskCreationWhen: '',
  taskIntervalMinutes: 30,
  taskIntervalMonths: null,
  interactionIntervalMinutes: 5,
  autoReplyIntervalMinutes: 5,
  autoReplyIntervalMonths: null,
  summaryIntervalMinutes: 30,
  summaryIntervalMonths: null,
  summaryInstructions: '',
  suggestWhen: '',
  suggestHow: '',
  monitorModel: 'gpt-6-luna',
  autoReplyWhen: '',
  autoReplyHow: '',
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

export function validateTelegramScanInterval(
  value: unknown, field: string, disabledAllowed = false
): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) ||
      (value !== 0 && (!disabledAllowed || value !== -1) && value < 1) ||
      value > TELEGRAM_AI_CUSTOM_MAX_MINUTES) {
    throw new TelegramUserClientError(400, 'Недопустимая частота: ' + field);
  }
  return value;
}

export function validateTelegramScanMonths(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) ||
      value < 1 || value > TELEGRAM_AI_CUSTOM_MAX_MONTHS) {
    throw new TelegramUserClientError(400, 'Недопустимое количество месяцев: ' + field);
  }
  return value;
}

export function validateTelegramCreditLimit(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) ||
      value < 1 || value > TELEGRAM_AI_CUSTOM_MAX_CREDIT_MILLI) {
    throw new TelegramUserClientError(400, 'Дневной лимит должен быть от 0,001 до 100 000 кредитов');
  }
  return value;
}

/** Strict full payload: no hidden flags and no client-supplied identity or activation. */
export function validateTelegramAiChatSettings(payload: unknown): TelegramAiChatSettings {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TelegramUserClientError(400, 'Укажите настройки Telegram-ассистента');
  }
  const p = payload as Record<string, unknown>;
  for (const field of ['summaryInstructions', 'suggestWhen', 'suggestHow', 'autoReplyWhen', 'autoReplyHow', 'taskCreationWhen'] as const) {
    const value = p[field];
    if (value !== undefined && (typeof value !== 'string' || value.length > 2000 ||
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))) {
      throw new TelegramUserClientError(400, 'Инструкции участия в переписке и сводок должны быть текстом до 2000 символов');
    }
  }
  if (p.mode === 'SUGGEST' && (!(p.suggestWhen as string | undefined)?.trim() ||
    !(p.suggestHow as string | undefined)?.trim())) {
    throw new TelegramUserClientError(400, 'Для предложений ответов заполните оба поля');
  }
  if (p.mode === 'AUTO' && (!(p.autoReplyWhen as string | undefined)?.trim() ||
    !(p.autoReplyHow as string | undefined)?.trim())) {
    throw new TelegramUserClientError(400, 'Для автоответов заполните оба поля: когда отвечать и как отвечать');
  }
  if (p.reviewAttachments !== undefined && typeof p.reviewAttachments !== 'boolean') {
    throw new TelegramUserClientError(400, 'Настройка просмотра вложений должна быть логическим значением');
  }
  if (typeof p.notifyImportant !== 'boolean') {
    throw new TelegramUserClientError(400, 'Настройка уведомлений должна быть логическим значением');
  }
  const taskIntervalMonths = validateTelegramScanMonths(p.taskIntervalMonths, 'добавление задач');
  const autoReplyIntervalMonths = validateTelegramScanMonths(p.autoReplyIntervalMonths, 'автоответы');
  const summaryIntervalMonths = validateTelegramScanMonths(p.summaryIntervalMonths, 'сводки');
  if (summaryIntervalMonths !== null && p.summaryIntervalMinutes === -1) {
    throw new TelegramUserClientError(400, 'Отключённые сводки не могут иметь месячную частоту');
  }
  return {
    mode: oneOf(p.mode, MODES, 'режим работы'),
    taskMode: oneOf(p.taskMode, TASK_MODES, 'добавление задач'),
    taskCreationWhen: typeof p.taskCreationWhen === 'string' ? p.taskCreationWhen.trim() : '',
    taskIntervalMinutes: validateTelegramScanInterval(p.taskIntervalMinutes === undefined ? 30 : p.taskIntervalMinutes, 'добавление задач'),
    taskIntervalMonths,
    interactionIntervalMinutes: oneOf(p.interactionIntervalMinutes, TELEGRAM_AI_INTERVALS, 'частота предложений ответов'),
    autoReplyIntervalMinutes: validateTelegramScanInterval(p.autoReplyIntervalMinutes, 'автоответы'),
    autoReplyIntervalMonths,
    summaryIntervalMinutes: validateTelegramScanInterval(p.summaryIntervalMinutes, 'сводки', true),
    summaryIntervalMonths,
    summaryInstructions: typeof p.summaryInstructions === 'string' ? p.summaryInstructions.trim() : '',
    suggestWhen: typeof p.suggestWhen === 'string' ? p.suggestWhen.trim() : '',
    suggestHow: typeof p.suggestHow === 'string' ? p.suggestHow.trim() : '',
    monitorModel: oneOf(p.monitorModel, TELEGRAM_AI_MONITOR_MODELS, 'модель мониторинга'),
    autoReplyWhen: typeof p.autoReplyWhen === 'string' ? p.autoReplyWhen.trim() : '',
    autoReplyHow: typeof p.autoReplyHow === 'string' ? p.autoReplyHow.trim() : '',
    notifyImportant: p.notifyImportant,
    reviewAttachments: p.reviewAttachments !== false,
    dailyCreditLimitMilli: validateTelegramCreditLimit(p.dailyCreditLimitMilli)
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
    if (settings.mode === 'AUTO' && !capability.sendEnabled) {
      throw new TelegramUserClientError(403, 'Для автоответов разрешите отправку сообщений через подключённый Telegram');
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
    if (!fresh.connected || !fresh.readEnabled || (settings.mode === 'AUTO' && !fresh.sendEnabled)) {
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
