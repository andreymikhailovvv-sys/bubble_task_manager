import { authService } from '../auth/auth.service.js';
import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { aiAssistantService } from './ai-assistant.service.js';
import type { ChatMessage } from './ai-assistant.service.js';

const TELEGRAM_API = 'https://api.telegram.org';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;
const MINI_APP_URL = process.env.TELEGRAM_MINI_APP_URL?.trim()
  || process.env.MINI_APP_URL?.trim()
  || process.env.APP_BASE_URL?.trim()
  || 'https://bubble-task-manager.onrender.com/miniapp';
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MOSCOW_TIMEZONE = 'Europe/Moscow';
const MAX_SHINE_WINDOW_MINUTES = 180;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME?.trim() || null;
const TELEGRAM_LINK_SECRET = process.env.TELEGRAM_LINK_SECRET?.trim() || BOT_TOKEN || null;
const TELEGRAM_LINK_TTL_SECONDS = 5 * 60;
const TELEGRAM_DEEP_LINK_PREFIX = 'link_';

type TelegramLinkTokenRecord = {
  userId: string;
  expiresAt: number;
  createdAt: number;
};

const telegramLinkTokens = new Map<string, TelegramLinkTokenRecord>();

const maskToken = (value: string) => value.length <= 8 ? `${value.length} chars` : `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} chars)`;

const cleanupExpiredTelegramLinkTokens = () => {
  const now = Math.floor(Date.now() / 1000);
  let removed = 0;
  for (const [token, record] of telegramLinkTokens.entries()) {
    if (record.expiresAt <= now) {
      telegramLinkTokens.delete(token);
      removed += 1;
    }
  }
  if (removed > 0) {
    console.info(`[TelegramLink] cleaned up expired link tokens count=${removed} remaining=${telegramLinkTokens.size}`);
  }
};

type TelegramFile = {
  file_id: string;
  file_size?: number;
  file_path?: string;
  mime_type?: string;
  file_name?: string;
  width?: number;
  height?: number;
};

type TelegramUpdate = {
  message?: {
    chat: { id: number };
    text?: string;
    caption?: string;
    document?: TelegramFile;
    photo?: TelegramFile[];
    voice?: TelegramFile;
    audio?: TelegramFile;
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: {
      message_id: number;
      chat: { id: number };
      text?: string;
    };
  };
};

type ChatAttachment = {
  name: string;
  mimeType: string;
  contentBase64: string;
  size: number;
};

const listTaskIdsByChatId = new Map<string, string[]>();
const pendingAiAttachmentByChatId = new Map<string, ChatAttachment>();
const generalAiHistoryByChatId = new Map<string, ChatMessage[]>();

const isEnabled = () => Boolean(BOT_TOKEN);

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const formatAiTextWithBold = (value: string) => {
  const escaped = escapeHtml(value);
  return escaped.replace(/\*\*(.+?)\*\*/gs, '<b>$1</b>');
};

const buildMiniAppTaskUrl = (taskId: string) => {
  const normalizedBase = MINI_APP_URL.endsWith('/') ? MINI_APP_URL.slice(0, -1) : MINI_APP_URL;
  const url = new URL(normalizedBase);
  url.searchParams.set('taskId', taskId);
  return url.toString();
};

const buildMiniAppTaskAiUrl = (taskId: string) => {
  const url = new URL(buildMiniAppTaskUrl(taskId));
  url.searchParams.set('openAi', '1');
  return url.toString();
};

const formatDeadlineLeft = (dueDate: Date | null) => {
  if (!dueDate) return '⏳ Дедлайн не указан';
  const diffMs = dueDate.getTime() - Date.now();
  if (diffMs <= 0) return '🚨 Дедлайн уже наступил';

  const totalMinutes = Math.ceil(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const chunks: string[] = [];
  if (days) chunks.push(`${days} д`);
  if (hours) chunks.push(`${hours} ч`);
  if (minutes) chunks.push(`${minutes} мин`);
  if (chunks.length === 0) chunks.push('меньше минуты');

  return `⏰ До дедлайна: <b>${chunks.join(' ')}</b>`;
};

const formatDate = (value: Date | null) => {
  if (!value) return 'не указан';
  return value.toLocaleString('ru-RU', { timeZone: MOSCOW_TIMEZONE });
};

const formatLocalReminderSlot = (date: Date, timeZone: string) => {
  const format = (targetTimeZone: string) => new Intl.DateTimeFormat('en-CA', {
    timeZone: targetTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = format(timeZone);
  } catch {
    parts = format(MOSCOW_TIMEZONE);
  }

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`
  };
};

const normalizeHabitReminderTimes = (value: unknown, fallback?: string | null) => {
  const source = Array.isArray(value) ? value : fallback ? [fallback] : [];
  return Array.from(new Set(source
    .map((item) => typeof item === 'string' ? item.trim() : '')
    .filter((item) => TIME_PATTERN.test(item))))
    .sort();
};


const sortSubtasksByStatusAndDeadline = <T extends { status: string; dueDate: Date | null }>(subtasks: T[]) => subtasks
  .slice()
  .sort((a, b) => {
    const statusDiff = Number(a.status === 'DONE') - Number(b.status === 'DONE');
    if (statusDiff !== 0) return statusDiff;
    const aTs = a.dueDate ? a.dueDate.getTime() : Number.POSITIVE_INFINITY;
    const bTs = b.dueDate ? b.dueDate.getTime() : Number.POSITIVE_INFINITY;
    if (aTs !== bTs) return aTs - bTs;
    return 0;
  });


const createTelegramLinkToken = (userId: string) => {
  cleanupExpiredTelegramLinkTokens();

  if (!TELEGRAM_BOT_USERNAME) {
    console.warn(`[TelegramLink] cannot create link token: TELEGRAM_BOT_USERNAME is missing userId=${userId}`);
    return null;
  }

  if (!TELEGRAM_LINK_SECRET) {
    console.warn(`[TelegramLink] cannot create link token: TELEGRAM_LINK_SECRET/TELEGRAM_BOT_TOKEN is missing userId=${userId}`);
    return null;
  }

  const expiresAt = Math.floor(Date.now() / 1000) + TELEGRAM_LINK_TTL_SECONDS;
  const token = crypto.randomBytes(16).toString('base64url');
  telegramLinkTokens.set(token, { userId, expiresAt, createdAt: Math.floor(Date.now() / 1000) });

  const startPayload = `${TELEGRAM_DEEP_LINK_PREFIX}${token}`;
  const deepLinkUrl = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(startPayload)}`;
  console.info(
    `[TelegramLink] created link token userId=${userId} bot=${TELEGRAM_BOT_USERNAME} token=${maskToken(token)} startPayloadLength=${startPayload.length} expiresAt=${new Date(expiresAt * 1000).toISOString()} activeTokens=${telegramLinkTokens.size}`
  );

  return {
    deepLinkUrl,
    expiresInSeconds: TELEGRAM_LINK_TTL_SECONDS
  };
};

const consumeTelegramLinkToken = async (token: string, chatId: string) => {
  cleanupExpiredTelegramLinkTokens();
  console.info(`[TelegramLink] consume attempt chatId=${chatId} token=${maskToken(token)} activeTokens=${telegramLinkTokens.size}`);

  if (!TELEGRAM_LINK_SECRET) {
    console.warn(`[TelegramLink] consume failed: link secret is not configured chatId=${chatId}`);
    return { ok: false as const, reason: 'disabled' as const };
  }

  const record = telegramLinkTokens.get(token);
  if (!record) {
    console.warn(`[TelegramLink] consume failed: token not found or already used chatId=${chatId} token=${maskToken(token)} activeTokens=${telegramLinkTokens.size}`);
    return { ok: false as const, reason: 'invalid' as const };
  }

  telegramLinkTokens.delete(token);

  if (Math.floor(Date.now() / 1000) > record.expiresAt) {
    console.warn(`[TelegramLink] consume failed: token expired chatId=${chatId} userId=${record.userId} expiresAt=${new Date(record.expiresAt * 1000).toISOString()}`);
    return { ok: false as const, reason: 'expired' as const };
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) {
      console.warn(`[TelegramLink] consume failed: user not found chatId=${chatId} userId=${record.userId}`);
      return { ok: false as const, reason: 'invalid' as const };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: chatId, telegramLinkedAt: new Date() }
    });
    await resetBotMenuState(chatId);
    await setSession(chatId, { userId: user.id });
    console.info(`[TelegramLink] consume success chatId=${chatId} userId=${user.id} username=${user.username ?? ''}`);
    return { ok: true as const, user };
  } catch (error) {
    console.error(`[TelegramLink] consume failed with unexpected error chatId=${chatId} userId=${record.userId}`, error);
    return { ok: false as const, reason: 'invalid' as const };
  }
};

const keyboardMain = (taskId: string) => ({
  inline_keyboard: [
    [
      { text: '⏳ Отложить', callback_data: `snooze:${taskId}` },
      { text: '✅ Выполнить', callback_data: `done:${taskId}` }
    ],
    [{ text: '📱 Посмотреть задачу', web_app: { url: buildMiniAppTaskUrl(taskId) } }],
    [{ text: '🤖 Написать ИИ', web_app: { url: buildMiniAppTaskAiUrl(taskId) } }]
  ]
});

const keyboardTaskDetails = (taskId: string, page = 1, totalPages = 1) => {
  const pagingRow: Array<{ text: string; callback_data: string }> = [];

  if (totalPages > 1) {
    if (page > 1) {
      pagingRow.push({ text: '⬅️ Пред.', callback_data: `subtasks_page:${taskId}:${page - 1}` });
    }
    pagingRow.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'noop' });
    if (page < totalPages) {
      pagingRow.push({ text: 'След. ➡️', callback_data: `subtasks_page:${taskId}:${page + 1}` });
    }
  }

  return {
    inline_keyboard: [
      ...(pagingRow.length > 0 ? [pagingRow] : []),
      [
        { text: '✅ Выполнить', callback_data: `done:${taskId}` },
        { text: '🗑 Удалить', callback_data: `delete:${taskId}` }
      ],
      [{ text: '🤖 Написать ИИ', web_app: { url: buildMiniAppTaskAiUrl(taskId) } }],
      [{ text: '⬅️ Назад к списку', callback_data: 'backlist' }]
    ]
  };
};

const keyboardBackTask = (taskId: string) => ({
  inline_keyboard: [[{ text: '⬅️ Назад', callback_data: `backtask:${taskId}` }]]
});

const keyboardSubtaskDetails = (subtaskId: string, parentTaskId: string) => ({
  inline_keyboard: [
    [
      { text: '✅ Закрыть', callback_data: `done_subtask:${subtaskId}` },
      { text: '🗑 Удалить', callback_data: `delete_subtask:${subtaskId}` }
    ],
    [{ text: '⏳ Перенести', callback_data: `snooze_subtask:${subtaskId}` }],
    [{ text: '⬅️ Назад к задаче', callback_data: `backtask:${parentTaskId}` }]
  ]
});

const keyboardSubtaskSnooze = (subtaskId: string, parentTaskId: string) => ({
  inline_keyboard: [
    [
      { text: '🕒 +15 мин', callback_data: `snooze_set_subtask:${subtaskId}:15` },
      { text: '🕞 +30 мин', callback_data: `snooze_set_subtask:${subtaskId}:30` }
    ],
    [
      { text: '🕐 +1 час', callback_data: `snooze_set_subtask:${subtaskId}:60` },
      { text: '🕒 +3 часа', callback_data: `snooze_set_subtask:${subtaskId}:180` }
    ],
    [{ text: '⬅️ Назад', callback_data: `opensubtask:${subtaskId}` }]
  ]
});

const keyboardSnooze = (taskId: string) => ({
  inline_keyboard: [
    [
      { text: '🕒 +15 мин', callback_data: `snooze_set:${taskId}:15` },
      { text: '🕞 +30 мин', callback_data: `snooze_set:${taskId}:30` }
    ],
    [
      { text: '🕐 +1 час', callback_data: `snooze_set:${taskId}:60` },
      { text: '🕒 +3 часа', callback_data: `snooze_set:${taskId}:180` }
    ],
    [{ text: '⬅️ Назад', callback_data: `backtask:${taskId}` }]
  ]
});

const keyboardHabitMain = (habitId: string) => ({
  inline_keyboard: [[
    { text: '⏳ Перенести', callback_data: `habit_snooze:${habitId}` },
    { text: '✅ Выполнить', callback_data: `habit_done:${habitId}` }
  ]]
});

const keyboardHabitSnooze = (habitId: string) => ({
  inline_keyboard: [
    [
      { text: '🕒 +15 мин', callback_data: `habit_snooze_set:${habitId}:15` },
      { text: '🕞 +30 мин', callback_data: `habit_snooze_set:${habitId}:30` }
    ],
    [
      { text: '🕐 +1 час', callback_data: `habit_snooze_set:${habitId}:60` },
      { text: '🕒 +3 часа', callback_data: `habit_snooze_set:${habitId}:180` }
    ],
    [{ text: '⬅️ Назад', callback_data: `habit_back:${habitId}` }]
  ]
});


const keyboardReplyMain = {
  remove_keyboard: true
};

const telegramRequest = async <T>(method: string, payload: Record<string, unknown>): Promise<T | null> => {
  if (!BOT_TOKEN) return null;
  const response = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    console.error('[Telegram] API error', { method, status: response.status, text: text.slice(0, 500) });
    return null;
  }
  return response.json() as Promise<T>;
};

const sendMessage = async (chatId: string, text: string, replyMarkup?: Record<string, unknown>) => {
  await telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup ?? keyboardReplyMain
  });
};

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
const SAFE_MAX_MESSAGE_LENGTH = TELEGRAM_MAX_MESSAGE_LENGTH - 200;
const MAX_TASK_DETAILS_DESCRIPTION_LENGTH = 1500;
const MIN_SUBTASK_LINES_IN_DETAILS = 5;
const TASK_DETAILS_SUBTASKS_PER_PAGE = 10;

const splitTextByLimit = (lines: string[], limit: number) => {
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const line of lines) {
    const nextLength = currentLength + line.length + 1;
    if (current.length > 0 && nextLength > limit) {
      chunks.push(current.join('\n'));
      current = [line];
      currentLength = line.length;
      continue;
    }

    current.push(line);
    currentLength = nextLength;
  }

  if (current.length > 0) {
    chunks.push(current.join('\n'));
  }

  return chunks;
};

const truncateEscapedText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const decodeHtmlEntity = (entity: string) => {
  const namedEntities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  };

  const named = entity.match(/^&([a-zA-Z][a-zA-Z0-9]+);$/);
  if (named) return namedEntities[named[1]] ?? entity;

  const decimal = entity.match(/^&#(\d+);$/);
  if (decimal) {
    const codePoint = Number(decimal[1]);
    return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
  }

  const hex = entity.match(/^&#x([\da-fA-F]+);$/);
  if (hex) {
    const codePoint = Number.parseInt(hex[1], 16);
    return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
  }

  return entity;
};

const noteHtmlToTelegramText = (value?: string | null) => {
  const raw = value?.trim();
  if (!raw) return 'Без описания';

  const plain = raw
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:[a-zA-Z][a-zA-Z0-9]+|#\d+|#x[\da-fA-F]+);/g, decodeHtmlEntity)
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return plain || 'Без описания';
};

const escapeTaskDescription = (value?: string | null) => escapeHtml(noteHtmlToTelegramText(value));

const editMessage = async (chatId: string, messageId: number, text: string, replyMarkup?: Record<string, unknown>) => {
  await telegramRequest('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup
  });
};

const answerCallback = async (callbackQueryId: string, text?: string) => {
  await telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false
  });
};

const getTaskNotificationText = async (taskId: string, userId: string) => {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    include: {
      subtasks: { orderBy: { createdAt: 'asc' } },
      parentTask: true
    }
  });

  if (!task) return null;

  const title = escapeHtml(task.title);
  const description = escapeTaskDescription(task.description);
  const lines = [
    '🔔 <b>Задача начинает сиять</b>',
    '',
    `🧩 <b>${title}</b>`,
    `${description}`,
    '',
    formatDeadlineLeft(task.dueDate)
  ];

  if (task.parentTaskId) {
    lines.push('', '📌 <b>Основная задача</b>');
    lines.push(`• <b>${escapeHtml(task.parentTask?.title ?? '—')}</b>`);
    lines.push(`${escapeTaskDescription(task.parentTask?.description)}`);
  } else if (task.subtasks.length > 0) {
    lines.push('', '🗂 <b>Подзадачи</b>');
    for (const subtask of task.subtasks) {
      lines.push(`• <b>${escapeHtml(subtask.title)}</b> — ${formatDate(subtask.dueDate)}`);
    }
  }

  return lines.join('\n');
};


const getHabitCompletionAmount = async (habitId: string, userId: string, dateKey: string) => {
  const aggregate = await prisma.habitCompletion.aggregate({
    where: { habitId, userId, dateKey },
    _sum: { amount: true }
  });
  return aggregate._sum.amount ?? 0;
};

const getHabitNotificationText = async (habitId: string, userId: string, dateKey: string, reminderTime: string) => {
  const habit = await prisma.habit.findFirst({
    where: { id: habitId, userId, isArchived: false },
    select: { id: true, name: true, icon: true, targetCount: true, recurrenceType: true, intervalDays: true, weekdays: true }
  });
  if (!habit) return null;

  const completed = await getHabitCompletionAmount(habit.id, userId, dateKey);
  const lines = [
    '🔔 <b>Напоминание о привычке</b>',
    '',
    `${escapeHtml(habit.icon)} <b>${escapeHtml(habit.name)}</b>`,
    `☑️ Выполнено: <b>${completed}-${habit.targetCount}</b>`,
    `⏰ Время: <b>${escapeHtml(reminderTime)}</b>`
  ];
  return lines.join('\n');
};

const completeHabitFromTelegram = async (habitId: string, userId: string, dateKey: string) => {
  const habit = await prisma.habit.findFirst({ where: { id: habitId, userId, isArchived: false } });
  if (!habit) return null;

  await prisma.habitCompletion.create({
    data: {
      habitId: habit.id,
      userId,
      amount: 1,
      dateKey,
      completedAt: new Date(),
      targetAtCompletion: habit.targetCount,
      recurrenceSnapshot: {
        recurrenceType: habit.recurrenceType,
        intervalDays: habit.intervalDays,
        weekdays: habit.weekdays,
        reminderTime: habit.reminderTime,
        reminderTimes: habit.reminderTimes
      }
    }
  });

  const completed = await getHabitCompletionAmount(habit.id, userId, dateKey);
  return { habit, completed };
};

const getTaskDetailsText = async (taskId: string, userId: string, taskIndex?: number, subtaskPage = 1) => {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId, parentTaskId: null },
    include: {
      subtasks: { orderBy: { createdAt: 'asc' } }
    }
  });

  if (!task) return null;

  const subtitle = typeof taskIndex === 'number'
    ? `📌 <b>Детали задачи #${taskIndex}</b>`
    : '📌 <b>Детали задачи</b>';

  const sortedSubtasks = sortSubtasksByStatusAndDeadline(task.subtasks);
  const allSubtaskLines = sortedSubtasks.length
    ? sortedSubtasks.map((subtask, index) => {
      const title = escapeHtml(subtask.title);
      const decoratedTitle = subtask.status === 'DONE' ? `<s>${title}</s>` : title;
      return `${index + 1}. ${subtask.status === 'DONE' ? '✅' : '▫️'} ${decoratedTitle}`;
    })
    : ['— подзадач пока нет'];

  const totalPages = Math.max(1, Math.ceil(allSubtaskLines.length / TASK_DETAILS_SUBTASKS_PER_PAGE));
  const currentPage = Math.min(Math.max(1, subtaskPage), totalPages);
  const pageStart = (currentPage - 1) * TASK_DETAILS_SUBTASKS_PER_PAGE;
  const pageEnd = pageStart + TASK_DETAILS_SUBTASKS_PER_PAGE;
  let subtaskLines = allSubtaskLines.slice(pageStart, pageEnd);
  const escapedDescription = truncateEscapedText(
    escapeTaskDescription(task.description),
    MAX_TASK_DETAILS_DESCRIPTION_LENGTH
  );

  let lines = [
    subtitle,
    '',
    `📍 <b>${escapeHtml(task.title)}</b>`,
    '',
    '🧩 <b>Описание подзадачи</b>',
    escapedDescription,
    '',
    `⏳ <b>Дедлайн:</b> ${escapeHtml(formatDate(task.dueDate))}`,
    '',
    `☑️ <b>Подзадачи:</b> (страница ${currentPage}/${totalPages})`,
    ...subtaskLines
  ];

  let result = lines.join('\n');
  while (result.length > SAFE_MAX_MESSAGE_LENGTH && subtaskLines.length > MIN_SUBTASK_LINES_IN_DETAILS) {
    subtaskLines = subtaskLines.slice(0, -1);
    lines = [
      subtitle,
      '',
      `📍 <b>${escapeHtml(task.title)}</b>`,
      '',
      '🧩 <b>Описание подзадачи</b>',
      escapedDescription,
      '',
      `⏳ <b>Дедлайн:</b> ${escapeHtml(formatDate(task.dueDate))}`,
      '',
      `☑️ <b>Подзадачи:</b> (страница ${currentPage}/${totalPages}, показано ${subtaskLines.length})`,
      ...subtaskLines
    ];
    result = lines.join('\n');
  }

  if (result.length > SAFE_MAX_MESSAGE_LENGTH) {
    const shortLines = [
      subtitle,
      '',
      `📍 <b>${escapeHtml(task.title)}</b>`,
      '',
      '🧩 <b>Описание подзадачи</b>',
      truncateEscapedText(escapedDescription, 700),
      '',
      `⏳ <b>Дедлайн:</b> ${escapeHtml(formatDate(task.dueDate))}`,
      '',
      `☑️ <b>Подзадачи:</b> всего ${allSubtaskLines.length}`
    ];
    return {
      text: shortLines.join('\n'),
      page: currentPage,
      totalPages
    };
  }

  return {
    text: result,
    page: currentPage,
    totalPages
  };
};

const getSubtaskDetailsByIndex = async (parentTaskId: string, userId: string, subtaskIndex: number) => {
  if (!Number.isInteger(subtaskIndex) || subtaskIndex < 1) return null;

  const parentTask = await prisma.task.findFirst({
    where: { id: parentTaskId, userId, parentTaskId: null },
    include: {
      subtasks: { orderBy: { createdAt: 'asc' } }
    }
  });

  if (!parentTask) return null;

  const sortedSubtasks = sortSubtasksByStatusAndDeadline(parentTask.subtasks);
  const subtask = sortedSubtasks[subtaskIndex - 1];
  if (!subtask) return null;

  const lines = [
    `🧷 <b>Подзадача #${subtaskIndex}</b>`,
    '',
    `📍 <b>${escapeHtml(subtask.title)}</b>`,
    '',
    '🧩 <b>Описание</b>',
    escapeTaskDescription(subtask.description),
    '',
    `⏳ <b>Дедлайн:</b> ${escapeHtml(formatDate(subtask.dueDate))}`,
    `📌 <b>Статус:</b> ${subtask.status === 'DONE' ? '✅ Выполнена' : '▫️ Активна'}`
  ];

  return {
    text: lines.join('\n'),
    subtaskId: subtask.id
  };
};

const sendOverdueTaskNotification = async (taskId: string, userId: string, aiMessage: string) => {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    select: {
      id: true,
      title: true,
      description: true,
      user: { select: { telegramChatId: true } }
    }
  });

  if (!task?.user.telegramChatId) return;

  const lines = [
    '🚨 <b>Дедлайн краснеет!</b>',
    '',
    `🧩 <b>${escapeHtml(task.title)}</b>`,
    `${escapeTaskDescription(task.description)}`,
    '',
    '🤖 <b>Сообщение от ИИ</b>',
    escapeHtml(aiMessage)
  ];

  await sendMessage(task.user.telegramChatId, lines.join('\n'), keyboardMain(task.id));
};

const setSession = async (chatId: string, patch: { userId?: string | null; mode?: string; activeTaskId?: string | null }) => {
  const update: Prisma.TelegramSessionUpdateInput = {};
  if (patch.userId !== undefined) {
    update.user = patch.userId ? { connect: { id: patch.userId } } : { disconnect: true };
  }
  if (patch.mode !== undefined) {
    update.mode = patch.mode;
  }
  if (patch.activeTaskId !== undefined) {
    update.activeTaskId = patch.activeTaskId;
  }

  await prisma.telegramSession.upsert({
    where: { chatId },
    update,
    create: {
      chatId,
      userId: patch.userId ?? null,
      mode: patch.mode ?? 'IDLE',
      activeTaskId: patch.activeTaskId ?? null
    }
  });
};

const resetBotMenuState = async (chatId: string) => {
  listTaskIdsByChatId.delete(chatId);
  pendingAiAttachmentByChatId.delete(chatId);
  generalAiHistoryByChatId.delete(chatId);
  await setSession(chatId, { mode: 'IDLE', activeTaskId: null });
};

const handleLoginInput = async (chatId: string, text: string) => {
  const [loginRaw, passwordRaw] = text.trim().split(/\s+/, 2);
  const login = (loginRaw ?? '').trim().toLowerCase();
  const password = (passwordRaw ?? '').trim();

  if (!login || !password) {
    await sendMessage(chatId, '⚠️ Введите в формате: <b>логин пароль</b>.\n\nПример:\n<code>ivan qwerty123</code>');
    return;
  }

  const user = await prisma.user.findUnique({ where: { username: login } });
  if (!user?.passwordHash || !authService.verifyPassword(password, user.passwordHash)) {
    await sendMessage(chatId, '❌ Неверный логин или пароль. Попробуйте снова.');
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramChatId: chatId,
      telegramLinkedAt: new Date()
    }
  });

  await resetBotMenuState(chatId);
  await setSession(chatId, { userId: user.id });
  await sendMessage(
    chatId,
    `✅ <b>Аккаунт подключён.</b>\nТеперь я буду присылать уведомления по задачам, ${escapeHtml(user.name ?? user.username ?? '')} 🙌\n\nПросто напишите сообщение — я сразу отправлю его в общий чат с ИИ.`,
    keyboardReplyMain
  );
};

const buildTaskListTextParts = async (userId: string, chatId: string) => {
  const tasks = await prisma.task.findMany({
    where: { userId, status: { not: 'DONE' }, parentTaskId: null },
    select: { id: true, title: true, dueDate: true },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }]
  });

  const withDate = tasks.filter((task) => task.dueDate);
  const withoutDate = tasks.filter((task) => !task.dueDate);
  const ordered = [...withDate, ...withoutDate];

  listTaskIdsByChatId.set(chatId, ordered.map((task) => task.id));

  if (ordered.length === 0) {
    return ['📭 <b>Активных задач пока нет.</b>\n\nСоздайте новую задачу через «🤖 Создать задачу ИИ».'];
  }

  const lines = ['📋 <b>Список задач</b>', '', 'Введите номер задачи, чтобы открыть детали:'];
  ordered.forEach((task, index) => {
    lines.push(`${index + 1}. <b><u>Задача: ${escapeHtml(task.title)}</u></b>`);
    lines.push(`   ⏳ Дедлайн: ${escapeHtml(formatDate(task.dueDate))}`);
  });

  return splitTextByLimit(lines, SAFE_MAX_MESSAGE_LENGTH);
};

const createTaskFromAiPrompt = async (userId: string, prompt: string, attachment?: ChatAttachment) => {
  const generated = await aiAssistantService.generateTaskFromPrompt({
    userId,
    prompt,
    sphereId: null,
    autoAssignSphere: true,
    attachments: attachment ? [attachment] : []
  });

  const importance = generated.task.importance ?? 3;
  const urgency = generated.task.urgency ?? 3;

  const createdTask = await prisma.task.create({
    data: {
      title: generated.task.title,
      description: generated.task.description,
      userId,
      sphereId: generated.suggestedSphereId ?? null,
      importance,
      urgency,
      priorityScore: Number((importance * 0.6 + urgency * 0.4).toFixed(2)),
      status: 'TODO',
      dueDate: generated.task.dueDate ? new Date(generated.task.dueDate) : null,
      notifyBeforeMinutes: generated.task.notifyBeforeMinutes
    }
  });

  if (attachment) {
    await prisma.taskAttachment.create({
      data: {
        taskId: createdTask.id,
        userId,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
        contentBase64: attachment.contentBase64
      }
    });
  }

  if (generated.task.subtasks.length > 0) {
    await prisma.$transaction(generated.task.subtasks.map((subtask) => prisma.task.create({
      data: {
        title: subtask.title,
        description: subtask.description,
        userId,
        parentTaskId: createdTask.id,
        sphereId: null,
        importance: 3,
        urgency: 3,
        priorityScore: 3,
        status: 'TODO',
        dueDate: subtask.dueDate ? new Date(subtask.dueDate) : null,
        notifyBeforeMinutes: 30
      }
    })));
  }

  await aiAssistantService.appendTaskDialogMessages({
    userId,
    taskId: createdTask.id,
    messages: [{ role: 'assistant', content: generated.firstAssistantMessage }]
  });

  return { createdTask, generated };
};

const createTaskFromPromptAndNotify = async (
  chatId: string,
  userId: string,
  prompt: string,
  attachment?: ChatAttachment,
  transcript?: string
) => {
  await sendMessage(chatId, '🧠 Формирую задачу через ИИ...');

  try {
    const created = await createTaskFromAiPrompt(userId, prompt, attachment);
    pendingAiAttachmentByChatId.delete(chatId);
    await resetBotMenuState(chatId);

    const dueDateLabel = created.createdTask.dueDate ? formatDate(created.createdTask.dueDate) : 'не указан';
    const lines = [
      '✅ <b>Задача создана!</b>',
      '',
      transcript ? `🎤 <b>Расшифровка:</b> ${escapeHtml(transcript)}` : null,
      transcript ? '' : null,
      `🧩 <b>${escapeHtml(created.createdTask.title)}</b>`,
      `${escapeTaskDescription(created.createdTask.description)}`,
      `⏰ Дедлайн: <b>${escapeHtml(dueDateLabel)}</b>`,
      `🗂 Подзадач: <b>${created.generated.task.subtasks.length}</b>`,
      attachment ? '📎 Файл прикреплён к задаче.' : '📎 Файл не прикреплялся.',
      '',
      `🤖 <b>Первое сообщение ИИ:</b>\n${formatAiTextWithBold(created.generated.firstAssistantMessage)}`
    ].filter((line): line is string => Boolean(line));

    await sendMessage(chatId, lines.join('\n'), keyboardReplyMain);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось создать задачу через ИИ.';
    await sendMessage(chatId, `❌ ${escapeHtml(message)}`, keyboardReplyMain);
  }
};

const loadTelegramAttachment = async (message: TelegramUpdate['message']): Promise<ChatAttachment | null> => {
  if (!BOT_TOKEN || !message) return null;

  const document = message.document;
  const voice = message.voice;
  const audio = message.audio;
  const photo = Array.isArray(message.photo) && message.photo.length > 0
    ? message.photo[message.photo.length - 1]
    : null;

  const candidate = voice ?? audio ?? document ?? photo;
  if (!candidate?.file_id) return null;

  const resolvedMimeType = voice?.mime_type || audio?.mime_type || document?.mime_type || 'image/jpeg';
  const resolvedName = voice
    ? `telegram-voice-${Date.now()}.ogg`
    : audio?.file_name?.trim() || document?.file_name?.trim() || `telegram-file-${Date.now()}.${document ? 'bin' : 'jpg'}`;

  const fileInfo = await telegramRequest<{ ok: boolean; result?: { file_path?: string; file_size?: number } }>('getFile', {
    file_id: candidate.file_id
  });

  const filePath = fileInfo?.result?.file_path;
  if (!filePath) {
    throw new Error('Не удалось получить файл из Telegram.');
  }

  const response = await fetch(`${TELEGRAM_API}/file/bot${BOT_TOKEN}/${filePath}`);
  if (!response.ok) {
    throw new Error('Не удалось скачать файл из Telegram.');
  }

  const arrayBuffer = await response.arrayBuffer();
  const size = arrayBuffer.byteLength;

  if (size > MAX_ATTACHMENT_BYTES) {
    throw new Error('Файл слишком большой. Максимальный размер — 8 MB.');
  }

  return {
    name: resolvedName.slice(0, 180),
    mimeType: resolvedMimeType,
    size,
    contentBase64: Buffer.from(arrayBuffer).toString('base64')
  };
};

const handleIncomingMessage = async (updateMessage: NonNullable<TelegramUpdate['message']>) => {
  const chatId = String(updateMessage.chat.id);
  const text = typeof updateMessage.text === 'string' ? updateMessage.text.trim() : '';
  const caption = typeof updateMessage.caption === 'string' ? updateMessage.caption.trim() : '';
  const isVoiceMessage = Boolean(updateMessage.voice || updateMessage.audio);
  const descriptionText = text || caption;

  console.info(
    `[Telegram] incoming message chatId=${chatId} hasText=${Boolean(text)} hasCaption=${Boolean(caption)} hasVoice=${isVoiceMessage} hasDocument=${Boolean(updateMessage.document)} hasPhoto=${Boolean(updateMessage.photo?.length)} isStartCommand=${descriptionText.startsWith('/start')}`
  );

  const session = await prisma.telegramSession.findUnique({ where: { chatId } });
  console.info(`[Telegram] session lookup chatId=${chatId} found=${Boolean(session)} userId=${session?.userId ?? ''} mode=${session?.mode ?? ''}`);

  if (descriptionText.startsWith('/start')) {
    const [, payloadRaw = ''] = descriptionText.split(/\s+/, 2);
    const payload = payloadRaw.trim();
    console.info(`[TelegramLink] /start received chatId=${chatId} payloadLength=${payload.length} isLinkPayload=${payload.startsWith(TELEGRAM_DEEP_LINK_PREFIX)}`);

    if (payload.startsWith(TELEGRAM_DEEP_LINK_PREFIX)) {
      const token = payload.slice(TELEGRAM_DEEP_LINK_PREFIX.length);
      const result = await consumeTelegramLinkToken(token, chatId);
      if (result.ok) {
        await sendMessage(chatId, `✅ <b>Telegram подключён.</b>\nАккаунт ${escapeHtml(result.user.name ?? result.user.username ?? 'пользователя')} успешно привязан.`);
        return;
      }

      console.warn(`[TelegramLink] /start link payload failed chatId=${chatId} reason=${result.reason}`);
      const errorText = result.reason === 'expired'
        ? '⌛️ Ссылка устарела. Откройте сайт и сгенерируйте новый QR-код.'
        : '❌ Не удалось подтвердить ссылку. Сгенерируйте новый QR-код в приложении.';
      await sendMessage(chatId, errorText);
      return;
    }

    console.info(`[TelegramLink] /start without link payload chatId=${chatId} payloadLength=${payload.length}`);
    await resetBotMenuState(chatId);
    await sendMessage(
      chatId,
      '👋 <b>Bubble Task Manager Bot</b>\n\nЧтобы подключить аккаунт, нажмите кнопку ниже и отправьте <b>логин пароль</b> одним сообщением.',
      {
        inline_keyboard: [[{ text: '🔐 Войти', callback_data: 'auth_login' }]]
      }
    );
    return;
  }

  if (session?.mode === 'AWAITING_LINK_CREDENTIALS') {
    await handleLoginInput(chatId, descriptionText);
    return;
  }

  if (!session?.userId) {
    await sendMessage(chatId, 'ℹ️ Нажмите <b>/start</b>, чтобы подключить аккаунт.');
    return;
  }

  if (isVoiceMessage) {
    await sendMessage(chatId, '🎤 Голосовое получено. Расшифровываю и отправляю в общий чат с ИИ...');

    try {
      const voiceAttachment = await loadTelegramAttachment(updateMessage);
      if (!voiceAttachment) {
        await sendMessage(chatId, '⚠️ Не удалось прочитать голосовое сообщение. Попробуйте ещё раз.', keyboardReplyMain);
        return;
      }

      const transcript = await aiAssistantService.transcribeAudio({
        fileName: voiceAttachment.name,
        mimeType: voiceAttachment.mimeType,
        contentBase64: voiceAttachment.contentBase64
      });

      const history = generalAiHistoryByChatId.get(chatId) ?? [];
      const result = await aiAssistantService.askGeneralAssistant({
        userId: session.userId,
        question: transcript,
        history
      });
      const nextHistory: ChatMessage[] = [
        ...history,
        { role: 'user' as const, content: transcript },
        { role: 'assistant' as const, content: result.answer }
      ].slice(-20);
      generalAiHistoryByChatId.set(chatId, nextHistory);

      const lines = [
        `🎤 <b>Расшифровка:</b> ${escapeHtml(transcript)}`,
        '',
        `🤖 <b>Ответ ИИ</b>\n\n${formatAiTextWithBold(result.answer)}`
      ];
      if (result.actionReports.length > 0) {
        lines.push('', '<b>Что изменил ИИ:</b>', ...result.actionReports.map((report) => `• ${escapeHtml(report)}`));
      }

      await setSession(chatId, { mode: 'GENERAL_AI_CHAT', activeTaskId: null });
      await sendMessage(chatId, lines.join('\n'), keyboardReplyMain);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось обработать голосовое.';
      await sendMessage(chatId, `❌ ${escapeHtml(message)}`, keyboardReplyMain);
      return;
    }
  }

  if (descriptionText) {
    await setSession(chatId, { mode: 'GENERAL_AI_CHAT', activeTaskId: null });
  }

  if (session.mode === 'GENERAL_AI_CHAT' || descriptionText) {
    if (!descriptionText) {
      await sendMessage(chatId, '⚠️ Сообщение пустое. Напишите вопрос для ИИ.', keyboardReplyMain);
      return;
    }

    const history = generalAiHistoryByChatId.get(chatId) ?? [];
    const result = await aiAssistantService.askGeneralAssistant({
      userId: session.userId,
      question: descriptionText,
      history
    });
    const nextHistory: ChatMessage[] = [
      ...history,
      { role: 'user' as const, content: descriptionText },
      { role: 'assistant' as const, content: result.answer }
    ].slice(-20);
    generalAiHistoryByChatId.set(chatId, nextHistory);

    const lines = [
      `🤖 <b>Ответ ИИ</b>\n\n${formatAiTextWithBold(result.answer)}`
    ];
    if (result.actionReports.length > 0) {
      lines.push('', '<b>Что изменил ИИ:</b>', ...result.actionReports.map((report) => `• ${escapeHtml(report)}`));
    }

    await sendMessage(chatId, lines.join('\n'), keyboardReplyMain);
    return;
  }

  if ((session.mode === 'AI_CHAT' || session.mode === 'AWAITING_AI_MESSAGE') && session.activeTaskId) {
    let attachment: ChatAttachment | undefined;
    if (updateMessage.document || (updateMessage.photo && updateMessage.photo.length > 0)) {
      try {
        const loaded = await loadTelegramAttachment(updateMessage);
        if (loaded) {
          attachment = loaded;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось обработать файл.';
        await sendMessage(chatId, `⚠️ ${escapeHtml(message)}`, keyboardBackTask(session.activeTaskId));
        return;
      }
    }

    const question = descriptionText;
    if (attachment && !question) {
      pendingAiAttachmentByChatId.set(chatId, attachment);
      await sendMessage(chatId, '📎 Файл получил. Теперь пришлите текстовый вопрос к ИИ по этой задаче.', keyboardBackTask(session.activeTaskId));
      return;
    }

    if (!attachment && pendingAiAttachmentByChatId.has(chatId)) {
      attachment = pendingAiAttachmentByChatId.get(chatId);
    }

    if (!question && !attachment) {
      await sendMessage(chatId, '⚠️ Сообщение пустое. Напишите вопрос ИИ или нажмите «Назад».', keyboardBackTask(session.activeTaskId));
      return;
    }

    const history = await aiAssistantService.listTaskDialog({ userId: session.userId, taskId: session.activeTaskId });
    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { timeZone: true } });
    const userMessage = attachment
      ? `${question || 'Пользователь отправил сообщение с вложением.'}\n\n📎 Файл: ${attachment.name}`
      : question;
    const result = await aiAssistantService.askTaskAssistant({
      userId: session.userId,
      taskId: session.activeTaskId,
      question: question || 'Пользователь отправил сообщение с вложением. Проанализируй содержимое файла и ответь по задаче.',
      history,
      mode: 'fast',
      attachments: attachment ? [attachment] : [],
      userTimeZone: user?.timeZone || MOSCOW_TIMEZONE
    });

    await aiAssistantService.appendTaskDialogMessages({
      userId: session.userId,
      taskId: session.activeTaskId,
      messages: [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: result.answer }
      ]
    });

    pendingAiAttachmentByChatId.delete(chatId);
    await setSession(chatId, { mode: 'AI_CHAT' });
    await sendMessage(
      chatId,
      `🤖 <b>Ответ ИИ</b>\n\n${formatAiTextWithBold(result.answer)}\n\n✍️ Можете отправить следующее сообщение, чтобы продолжить диалог.`,
      keyboardBackTask(session.activeTaskId)
    );
    return;
  }

  if (session.mode === 'VIEWING_TASK_LIST') {
    const selectedIndex = Number(descriptionText);
    const taskIds = listTaskIdsByChatId.get(chatId) ?? [];

    if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex > taskIds.length) {
      await sendMessage(chatId, '⚠️ Введите корректный номер задачи из списка или нажмите «⬅️ Назад».', keyboardReplyMain);
      return;
    }

    const taskId = taskIds[selectedIndex - 1];
    const taskDetails = await getTaskDetailsText(taskId, session.userId, selectedIndex, 1);
    if (!taskDetails) {
      await sendMessage(chatId, '⚠️ Не удалось найти задачу. Обновите список через «📋 Посмотреть задачи».', keyboardReplyMain);
      return;
    }

    await sendMessage(chatId, taskDetails.text, keyboardTaskDetails(taskId, taskDetails.page, taskDetails.totalPages));
    await setSession(chatId, { mode: 'VIEWING_TASK_DETAILS', activeTaskId: taskId });
    return;
  }

  if (session.mode === 'VIEWING_TASK_DETAILS' && session.activeTaskId) {
    const selectedSubtaskIndex = Number(descriptionText);
    const subtaskDetails = await getSubtaskDetailsByIndex(session.activeTaskId, session.userId, selectedSubtaskIndex);

    if (!subtaskDetails) {
      await sendMessage(
        chatId,
        '⚠️ Введите корректный номер подзадачи из списка или нажмите «⬅️ Назад к списку».',
        keyboardTaskDetails(session.activeTaskId)
      );
      return;
    }

    await sendMessage(chatId, subtaskDetails.text, keyboardSubtaskDetails(subtaskDetails.subtaskId, session.activeTaskId));
    return;
  }

  if (session.mode === 'AWAITING_AI_TASK_PROMPT') {
    let attachment: ChatAttachment | undefined;

    if (updateMessage.document || (updateMessage.photo && updateMessage.photo.length > 0)) {
      try {
        const loaded = await loadTelegramAttachment(updateMessage);
        if (loaded) {
          attachment = loaded;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось обработать файл.';
        await sendMessage(chatId, `⚠️ ${escapeHtml(message)}`, keyboardReplyMain);
        return;
      }
    }

    const prompt = descriptionText;

    if (attachment && !prompt) {
      pendingAiAttachmentByChatId.set(chatId, attachment);
      await sendMessage(chatId, '📎 Файл получил. Теперь пришлите текстовое описание задачи, чтобы ИИ мог её сформировать.', keyboardReplyMain);
      return;
    }

    if (!attachment && pendingAiAttachmentByChatId.has(chatId)) {
      attachment = pendingAiAttachmentByChatId.get(chatId);
    }

    if (!prompt) {
      await sendMessage(chatId, '⚠️ Нужен текст с описанием задачи. Можно с файлом или без него.', keyboardReplyMain);
      return;
    }

    await createTaskFromPromptAndNotify(chatId, session.userId, prompt, attachment);
    return;
  }

  await sendMessage(chatId, '⚠️ Сообщение пустое. Напишите вопрос для ИИ.', keyboardReplyMain);
};

const handleCallback = async (update: TelegramUpdate) => {
  const callback = update.callback_query;
  if (!callback?.data || !callback.message) return;

  const chatId = String(callback.message.chat.id);
  const messageId = callback.message.message_id;
  const data = callback.data;

  if (data === 'auth_login') {
    await setSession(chatId, { mode: 'AWAITING_LINK_CREDENTIALS', activeTaskId: null });
    await answerCallback(callback.id);
    await sendMessage(chatId, '🔐 Отправьте одним сообщением: <b>логин пароль</b>.\n\nПример:\n<code>ivan qwerty123</code>', keyboardReplyMain);
    return;
  }

  if (data === 'noop') {
    await answerCallback(callback.id);
    return;
  }

  const parts = data.split(':');
  const action = parts[0];
  const taskId = parts[1];
  const value = parts[2];
  const session = await prisma.telegramSession.findUnique({ where: { chatId } });

  if (!session?.userId) {
    await answerCallback(callback.id, 'Сначала авторизуйтесь через /start');
    return;
  }
  const userId = session.userId;

  if (!taskId && action !== 'noop' && action !== 'backlist') {
    await answerCallback(callback.id, 'Некорректные данные');
    return;
  }
  const resolvedTaskId = taskId as string;

  if (action === 'habit_done') {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } });
    const slot = formatLocalReminderSlot(new Date(), user?.timeZone || MOSCOW_TIMEZONE);
    const result = await completeHabitFromTelegram(resolvedTaskId, userId, slot.dateKey);
    await answerCallback(callback.id, result ? 'Привычка отмечена' : 'Привычка не найдена');
    await editMessage(
      chatId,
      messageId,
      result
        ? `✅ <b>Готово!</b>\n${escapeHtml(result.habit.icon)} <b>${escapeHtml(result.habit.name)}</b>: <b>${result.completed}-${result.habit.targetCount}</b>`
        : '⚠️ <b>Привычка не найдена.</b>'
    );
    return;
  }

  if (action === 'habit_snooze') {
    await answerCallback(callback.id);
    await editMessage(chatId, messageId, '⏳ <b>На сколько перенести напоминание?</b>', keyboardHabitSnooze(resolvedTaskId));
    return;
  }

  if (action === 'habit_back') {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } });
    const slot = formatLocalReminderSlot(new Date(), user?.timeZone || MOSCOW_TIMEZONE);
    const text = await getHabitNotificationText(resolvedTaskId, userId, slot.dateKey, slot.time);
    await answerCallback(callback.id);
    await editMessage(chatId, messageId, text ?? '⚠️ <b>Привычка не найдена.</b>', keyboardHabitMain(resolvedTaskId));
    return;
  }

  if (action === 'habit_snooze_set') {
    const minutes = Number(value);
    if (!Number.isFinite(minutes)) {
      await answerCallback(callback.id, 'Некорректные данные');
      return;
    }

    const habit = await prisma.habit.findFirst({ where: { id: resolvedTaskId, userId, isArchived: false }, select: { id: true, name: true } });
    if (!habit) {
      await answerCallback(callback.id, 'Привычка не найдена');
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } });
    const scheduledAt = new Date(Date.now() + minutes * 60_000);
    const slot = formatLocalReminderSlot(scheduledAt, user?.timeZone || MOSCOW_TIMEZONE);
    await prisma.habitReminderDelivery.create({
      data: {
        habitId: habit.id,
        userId,
        dateKey: slot.dateKey,
        reminderTime: `${slot.time}:${Date.now().toString(36).slice(-4)}`,
        source: 'SNOOZE',
        scheduledAt
      }
    });

    await answerCallback(callback.id, `Перенесено на ${minutes} мин`);
    await editMessage(chatId, messageId, `✅ <b>Готово.</b>\nНапоминание привычки <b>${escapeHtml(habit.name)}</b> перенесено на <b>${minutes} мин</b>.`, keyboardHabitMain(habit.id));
    return;
  }

  if (action === 'backlist') {
    await setSession(chatId, { mode: 'VIEWING_TASK_LIST', activeTaskId: null });
    const listParts = await buildTaskListTextParts(userId, chatId);
    await answerCallback(callback.id);
    await editMessage(chatId, messageId, listParts[0]);
    for (const extraPart of listParts.slice(1)) {
      await sendMessage(chatId, extraPart, keyboardReplyMain);
    }
    return;
  }

  if (action === 'snooze') {
    await answerCallback(callback.id);
    await editMessage(chatId, messageId, '⏳ <b>На сколько отложить задачу?</b>', keyboardSnooze(resolvedTaskId));
    return;
  }

  if (action === 'snooze_set') {
    const minutes = Number(value);
    const task = await prisma.task.findFirst({ where: { id: resolvedTaskId, userId } });
    if (!task) {
      await answerCallback(callback.id, 'Задача не найдена');
      return;
    }

    const baseTime = task.dueDate && task.dueDate.getTime() > Date.now() ? task.dueDate : new Date();
    const dueDate = new Date(baseTime.getTime() + minutes * 60_000);

    await prisma.task.update({
      where: { id: task.id },
      data: { dueDate, telegramNotifiedAt: null }
    });

    await answerCallback(callback.id, `Отложено на ${minutes} мин`);
    await editMessage(chatId, messageId, `✅ <b>Готово.</b>\nЗадача отложена на <b>${minutes} мин</b>.\nНовый дедлайн: <b>${formatDate(dueDate)}</b>`, keyboardMain(task.id));
    return;
  }

  if (action === 'snooze_subtask') {
    const subtask = await prisma.task.findFirst({
      where: { id: resolvedTaskId, userId, parentTaskId: { not: null } },
      select: { id: true, parentTaskId: true }
    });
    if (!subtask?.parentTaskId) {
      await answerCallback(callback.id, 'Подзадача не найдена');
      return;
    }

    await answerCallback(callback.id);
    await editMessage(chatId, messageId, '⏳ <b>На сколько перенести подзадачу?</b>', keyboardSubtaskSnooze(resolvedTaskId, subtask.parentTaskId));
    return;
  }

  if (action === 'snooze_set_subtask') {
    const minutes = Number(parts[2]);
    if (!Number.isFinite(minutes)) {
      await answerCallback(callback.id, 'Некорректные данные');
      return;
    }

    const subtask = await prisma.task.findFirst({
      where: { id: resolvedTaskId, userId, parentTaskId: { not: null } },
      select: { id: true, parentTaskId: true, dueDate: true }
    });
    if (!subtask?.parentTaskId) {
      await answerCallback(callback.id, 'Подзадача не найдена');
      return;
    }

    const baseTime = subtask.dueDate && subtask.dueDate.getTime() > Date.now() ? subtask.dueDate : new Date();
    const dueDate = new Date(baseTime.getTime() + minutes * 60_000);
    await prisma.task.update({
      where: { id: subtask.id },
      data: { dueDate, telegramNotifiedAt: null }
    });

    await answerCallback(callback.id, `Перенесено на ${minutes} мин`);
    await editMessage(
      chatId,
      messageId,
      `✅ <b>Готово.</b>\nПодзадача перенесена на <b>${minutes} мин</b>.\nНовый дедлайн: <b>${formatDate(dueDate)}</b>`,
      keyboardSubtaskDetails(subtask.id, subtask.parentTaskId)
    );
    return;
  }

  if (action === 'done') {
    await prisma.$transaction(async (tx) => {
      const parentTask = await tx.task.findFirst({
        where: { id: resolvedTaskId, userId },
        select: { id: true, parentTaskId: true }
      });
      if (!parentTask) return;

      await tx.task.update({
        where: { id: parentTask.id },
        data: { status: 'DONE', telegramNotifiedAt: null }
      });

      if (!parentTask.parentTaskId) {
        await tx.task.updateMany({
          where: { parentTaskId: parentTask.id, userId, status: { not: 'DONE' } },
          data: { status: 'DONE', telegramNotifiedAt: null }
        });
      }
    });
    await answerCallback(callback.id, 'Задача закрыта');
    await editMessage(chatId, messageId, '✅ <b>Задача выполнена и закрыта.</b> Отличная работа!');
    return;
  }

  if (action === 'delete') {
    const deleted = await prisma.task.deleteMany({
      where: { id: resolvedTaskId, userId }
    });
    await answerCallback(callback.id, deleted.count ? 'Задача удалена' : 'Задача не найдена');
    await setSession(chatId, { mode: 'IDLE', activeTaskId: null });
    await editMessage(chatId, messageId, deleted.count ? '🗑 <b>Задача удалена.</b>' : '⚠️ <b>Задача не найдена.</b>');
    return;
  }

  if (action === 'done_subtask') {
    const subtask = await prisma.task.findFirst({
      where: { id: resolvedTaskId, userId, parentTaskId: { not: null } },
      select: { id: true, parentTaskId: true }
    });
    if (!subtask?.parentTaskId) {
      await answerCallback(callback.id, 'Подзадача не найдена');
      return;
    }

    const updated = await prisma.task.updateMany({
      where: { id: resolvedTaskId, userId, parentTaskId: subtask.parentTaskId },
      data: { status: 'DONE', telegramNotifiedAt: null }
    });
    await answerCallback(callback.id, updated.count ? 'Подзадача закрыта' : 'Подзадача не найдена');
    await editMessage(
      chatId,
      messageId,
      updated.count ? '✅ <b>Подзадача закрыта.</b>' : '⚠️ <b>Подзадача не найдена.</b>',
      keyboardBackTask(subtask.parentTaskId)
    );
    return;
  }

  if (action === 'delete_subtask') {
    const subtask = await prisma.task.findFirst({
      where: { id: resolvedTaskId, userId, parentTaskId: { not: null } },
      select: { id: true, parentTaskId: true }
    });
    if (!subtask?.parentTaskId) {
      await answerCallback(callback.id, 'Подзадача не найдена');
      return;
    }

    const deleted = await prisma.task.deleteMany({
      where: { id: resolvedTaskId, userId, parentTaskId: subtask.parentTaskId }
    });
    await answerCallback(callback.id, deleted.count ? 'Подзадача удалена' : 'Подзадача не найдена');
    await editMessage(
      chatId,
      messageId,
      deleted.count ? '🗑 <b>Подзадача удалена.</b>' : '⚠️ <b>Подзадача не найдена.</b>',
      keyboardBackTask(subtask.parentTaskId)
    );
    return;
  }

  if (action === 'subtasks_page') {
    const page = Number(value);
    const taskIds = listTaskIdsByChatId.get(chatId) ?? [];
    const index = taskIds.findIndex((id) => id === resolvedTaskId);
    const details = await getTaskDetailsText(resolvedTaskId, userId, index >= 0 ? index + 1 : undefined, Number.isFinite(page) ? page : 1);

    await answerCallback(callback.id);
    if (!details) {
      await editMessage(chatId, messageId, '⚠️ Не удалось открыть задачу. Обновите список через «📋 Посмотреть задачи».', keyboardReplyMain);
      return;
    }

    await editMessage(chatId, messageId, details.text, keyboardTaskDetails(resolvedTaskId, details.page, details.totalPages));
    await setSession(chatId, { mode: 'VIEWING_TASK_DETAILS', activeTaskId: resolvedTaskId });
    return;
  }

  if (action === 'opensubtask') {
    const subtask = await prisma.task.findFirst({
      where: { id: resolvedTaskId, userId, parentTaskId: { not: null } },
      select: { parentTaskId: true }
    });
    if (!subtask?.parentTaskId) {
      await answerCallback(callback.id, 'Подзадача не найдена');
      return;
    }

    const parentTask = await prisma.task.findFirst({
      where: { id: subtask.parentTaskId, userId, parentTaskId: null },
      include: { subtasks: { orderBy: { createdAt: 'asc' } } }
    });

    await answerCallback(callback.id);
    if (!parentTask) {
      await editMessage(chatId, messageId, '⚠️ Родительская задача не найдена.', keyboardReplyMain);
      return;
    }

    const sortedSubtasks = sortSubtasksByStatusAndDeadline(parentTask.subtasks);
    const subtaskIndex = sortedSubtasks.findIndex((item) => item.id === resolvedTaskId);
    if (subtaskIndex < 0) {
      await editMessage(chatId, messageId, '⚠️ Подзадача не найдена.', keyboardBackTask(subtask.parentTaskId));
      return;
    }

    const subtaskDetails = await getSubtaskDetailsByIndex(subtask.parentTaskId, userId, subtaskIndex + 1);
    if (!subtaskDetails) {
      await editMessage(chatId, messageId, '⚠️ Подзадача не найдена.', keyboardBackTask(subtask.parentTaskId));
      return;
    }

    await editMessage(chatId, messageId, subtaskDetails.text, keyboardSubtaskDetails(subtaskDetails.subtaskId, subtask.parentTaskId));
    return;
  }

  if (action === 'backtask') {
    await setSession(chatId, { mode: 'VIEWING_TASK_DETAILS', activeTaskId: resolvedTaskId });
    const taskIds = listTaskIdsByChatId.get(chatId) ?? [];
    const index = taskIds.findIndex((id) => id === resolvedTaskId);
    const details = await getTaskDetailsText(resolvedTaskId, userId, index >= 0 ? index + 1 : undefined, 1);
    await answerCallback(callback.id);
    if (details) {
      await editMessage(chatId, messageId, details.text, keyboardTaskDetails(resolvedTaskId, details.page, details.totalPages));
    } else {
      await editMessage(chatId, messageId, '⬅️ Возврат в меню уведомления.', keyboardTaskDetails(resolvedTaskId));
    }
  }
};


const notifyHabitReminders = async (now: Date) => {
  const habits = await prisma.habit.findMany({
    where: {
      isArchived: false,
      user: { telegramChatId: { not: null } }
    },
    select: {
      id: true,
      userId: true,
      name: true,
      reminderTime: true,
      reminderTimes: true,
      recurrenceType: true,
      intervalDays: true,
      weekdays: true,
      createdAt: true,
      user: { select: { telegramChatId: true, timeZone: true } }
    }
  });

  for (const habit of habits) {
    const chatId = habit.user.telegramChatId;
    if (!chatId) continue;

    const slot = formatLocalReminderSlot(now, habit.user.timeZone || MOSCOW_TIMEZONE);
    const reminderTimes = normalizeHabitReminderTimes(habit.reminderTimes, habit.reminderTime);
    const weekdays = Array.isArray(habit.weekdays) ? habit.weekdays.map((item) => Number(item)) : [];
    const localDay = new Date(`${slot.dateKey}T00:00:00Z`);
    const isScheduledDay = habit.recurrenceType === 'WEEKDAYS'
      ? weekdays.includes(localDay.getUTCDay())
      : habit.recurrenceType === 'INTERVAL'
        ? Math.max(0, Math.round((localDay.getTime() - Date.UTC(habit.createdAt.getUTCFullYear(), habit.createdAt.getUTCMonth(), habit.createdAt.getUTCDate())) / 86_400_000)) % Math.max(1, habit.intervalDays ?? 1) === 0
        : true;

    if (!isScheduledDay || !reminderTimes.includes(slot.time)) continue;

    const claimed = await prisma.habitReminderDelivery.createMany({
      data: [{
        habitId: habit.id,
        userId: habit.userId,
        dateKey: slot.dateKey,
        reminderTime: slot.time,
        source: 'SCHEDULED',
        scheduledAt: now,
        sentAt: now
      }],
      skipDuplicates: true
    });

    if (claimed.count === 0) continue;

    const text = await getHabitNotificationText(habit.id, habit.userId, slot.dateKey, slot.time);
    if (text) await sendMessage(chatId, text, keyboardHabitMain(habit.id));
  }

  const dueSnoozes = await prisma.habitReminderDelivery.findMany({
    where: {
      source: 'SNOOZE',
      sentAt: null,
      scheduledAt: { lte: now }
    },
    include: {
      habit: {
        select: {
          id: true,
          userId: true,
          name: true,
          isArchived: true,
          user: { select: { telegramChatId: true, timeZone: true } }
        }
      }
    },
    take: 100
  });

  for (const delivery of dueSnoozes) {
    if (delivery.habit.isArchived || !delivery.habit.user.telegramChatId) {
      await prisma.habitReminderDelivery.update({ where: { id: delivery.id }, data: { sentAt: now } });
      continue;
    }

    const slot = formatLocalReminderSlot(delivery.scheduledAt, delivery.habit.user.timeZone || MOSCOW_TIMEZONE);
    const text = await getHabitNotificationText(delivery.habit.id, delivery.habit.userId, slot.dateKey, slot.time);
    if (text) await sendMessage(delivery.habit.user.telegramChatId, text, keyboardHabitMain(delivery.habit.id));
    await prisma.habitReminderDelivery.update({ where: { id: delivery.id }, data: { sentAt: now } });
  }
};

export const telegramService = {
  isEnabled,
  createTelegramLinkToken,
  isWebhookAuthorized(headers: Record<string, unknown>) {
    if (!WEBHOOK_SECRET) return true;
    const header = String(headers['x-telegram-bot-api-secret-token'] ?? '');
    return header === WEBHOOK_SECRET;
  },
  async processWebhookUpdate(update: TelegramUpdate) {
    try {
      console.info(`[Telegram] processing update hasMessage=${Boolean(update.message)} hasCallback=${Boolean(update.callback_query)}`);
      if (update.callback_query) {
        await handleCallback(update);
        return;
      }

      if (update.message) {
        await handleIncomingMessage(update.message);
        return;
      }

      console.info('[Telegram] ignored update without message/callback_query');
    } catch (error) {
      console.error('[Telegram] Failed to process update', error);
    }
  },
  async notifyShiningTasks() {
    if (!BOT_TOKEN) return;

    const now = new Date();
    const tasks = await prisma.task.findMany({
      where: {
        status: { not: 'DONE' },
        dueDate: { not: null },
        notifyBeforeMinutes: { not: null },
        user: { telegramChatId: { not: null } }
      },
      select: {
        id: true,
        parentTaskId: true,
        dueDate: true,
        notifyBeforeMinutes: true,
        telegramNotifiedAt: true,
        userId: true,
        user: { select: { telegramChatId: true } }
      }
    });

    for (const task of tasks) {
      const dueAt = task.dueDate?.getTime() ?? 0;
      const diffMs = dueAt - now.getTime();
      const notifyWindowMs = Math.min(task.notifyBeforeMinutes ?? 0, MAX_SHINE_WINDOW_MINUTES) * 60_000;
      const isShining = diffMs > 0 && diffMs <= notifyWindowMs;

      if (isShining && !task.telegramNotifiedAt) {
        const text = await getTaskNotificationText(task.id, task.userId);
        if (text && task.user.telegramChatId) {
          await sendMessage(task.user.telegramChatId, text, keyboardMain(task.parentTaskId ?? task.id));
          await prisma.task.update({ where: { id: task.id }, data: { telegramNotifiedAt: now } });
        }
      }

      if (!isShining && task.telegramNotifiedAt) {
        await prisma.task.update({ where: { id: task.id }, data: { telegramNotifiedAt: null } });
      }
    }

    await notifyHabitReminders(now);
  },
  async notifyOverdueTaskAiMessage(input: { taskId: string; userId: string; aiMessage: string }) {
    if (!BOT_TOKEN) return;
    if (!input.aiMessage.trim()) return;
    await sendOverdueTaskNotification(input.taskId, input.userId, input.aiMessage);
  },
  async notifyDailyAiCheckup(input: { userId: string; text: string }) {
    if (!BOT_TOKEN) return;
    if (!input.text.trim()) return;
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { telegramChatId: true }
    });
    if (!user?.telegramChatId) return;
    await sendMessage(user.telegramChatId, input.text);
  }
};
