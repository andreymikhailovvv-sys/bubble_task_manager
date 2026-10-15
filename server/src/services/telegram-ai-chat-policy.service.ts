import { prisma } from '../db/prisma.js';
import { FixedWindowRateLimiter } from '../lib/security-rate-limiter.js';
import { parseTelegramSendTargetId } from './telegram-send-targets.service.js';
import { telegramUserChatCapability } from './telegram-user-client-chat-access.service.js';
import { telegramUserClientRead } from './telegram-user-client-read.service.js';
import { TelegramUserClientError } from './telegram-user-client-auth.service.js';

// PR1 has no worker and NO autonomous Telegram access. Configuration is not
// approval to start reading or writing. PR2 must implement an explicit activation.
const MAX_CHATS = 25;
const saveLimiter = new FixedWindowRateLimiter(20, 60_000);
const MODES = ['OBSERVE', 'SUGGEST', 'AUTO'] as const;
const LEVELS = ['IMPORTANT', 'STANDARD', 'DETAILED'] as const;
const FREQUENCIES = ['OFF', 'DAILY', 'WEEKLY'] as const;
const INTERVALS = [5, 15, 30, 60] as const;
const MESSAGE_LIMITS = [10, 20, 30, 50, 100] as const;

export type TelegramAiChatSettings = {
  mode: typeof MODES[number];
  analysisLevel: typeof LEVELS[number];
  checkIntervalMinutes: number;
  maxMessagesPerCheck: number;
  summaryFrequency: typeof FREQUENCIES[number];
  instructions: string;
  notifyImportant: boolean;
  suggestTasks: boolean;
  dailyCreditLimitMilli: number;
  monthlyCreditLimitMilli: number;
};

export const DEFAULT_TELEGRAM_AI_CHAT_SETTINGS: TelegramAiChatSettings = {
  mode: 'OBSERVE',
  analysisLevel: 'IMPORTANT',
  checkIntervalMinutes: 15,
  maxMessagesPerCheck: 20,
  summaryFrequency: 'DAILY',
  instructions: '',
  notifyImportant: true,
  suggestTasks: true,
  dailyCreditLimitMilli: 2000,
  monthlyCreditLimitMilli: 20000
};

const oneOf = <T extends string | number>(value: unknown, choices: readonly T[], field: string): T => {
  if (!choices.includes(value as T)) {
    throw new TelegramUserClientError(400, 'Недопустимое значение: ' + field);
  }
  return value as T;
};
const boundedCredits = (value: unknown, max: number, field: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max || value % 1000 !== 0) {
    throw new TelegramUserClientError(400, 'Некорректный лимит кредитов: ' + field);
  }
  return value;
};

/** Strict full payload: no hidden flags and no client-supplied identity or activation. */
export function validateTelegramAiChatSettings(payload: unknown): TelegramAiChatSettings {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TelegramUserClientError(400, 'Укажите настройки Telegram-ассистента');
  }
  const p = payload as Record<string, unknown>;
  const instructions = p.instructions;
  if (typeof instructions !== 'string' || instructions.length > 3000 ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(instructions)) {
    throw new TelegramUserClientError(400, 'Инструкции должны быть текстом до 3000 символов');
  }
  if (typeof p.notifyImportant !== 'boolean' || typeof p.suggestTasks !== 'boolean') {
    throw new TelegramUserClientError(400, 'Настройки уведомлений должны быть логическими значениями');
  }
  const dailyCreditLimitMilli = boundedCredits(p.dailyCreditLimitMilli, 200_000, 'дневной');
  const monthlyCreditLimitMilli = boundedCredits(p.monthlyCreditLimitMilli, 1_000_000, 'месячный');
  if (dailyCreditLimitMilli > monthlyCreditLimitMilli) {
    throw new TelegramUserClientError(400, 'Дневной лимит не может превышать месячный');
  }
  return {
    mode: oneOf(p.mode, MODES, 'режим работы'),
    analysisLevel: oneOf(p.analysisLevel, LEVELS, 'детализация'),
    checkIntervalMinutes: oneOf(p.checkIntervalMinutes, INTERVALS, 'интервал проверки'),
    maxMessagesPerCheck: oneOf(p.maxMessagesPerCheck, MESSAGE_LIMITS, 'число сообщений'),
    summaryFrequency: oneOf(p.summaryFrequency, FREQUENCIES, 'частота сводок'),
    instructions: instructions.trim(),
    notifyImportant: p.notifyImportant,
    suggestTasks: p.suggestTasks,
    dailyCreditLimitMilli,
    monthlyCreditLimitMilli
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
    const policies = await prisma.telegramAiChatPolicy.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: MAX_CHATS
    });
    // isEnabled is intentionally always false in PR1.
    return { policies, activationAvailable: false, maximumChats: MAX_CHATS };
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
        isEnabled: false
      }
    });
    return { policy, activationAvailable: false };
  },

  async remove(userId: string, chatIdInput: unknown) {
    const chatId = validateTargetId(chatIdInput);
    // Deleting a policy must remain possible if the Telegram session is lost.
    await prisma.telegramAiChatPolicy.deleteMany({ where: { userId, chatId } });
    return { ok: true };
  }
};
