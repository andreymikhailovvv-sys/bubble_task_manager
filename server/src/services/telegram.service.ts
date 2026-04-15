import { authService } from '../auth/auth.service.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { aiAssistantService } from './ai-assistant.service.js';

const TELEGRAM_API = 'https://api.telegram.org';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;

type TelegramUpdate = {
  message?: {
    chat: { id: number };
    text?: string;
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

const isEnabled = () => Boolean(BOT_TOKEN);

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

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
  return value.toLocaleString('ru-RU', { timeZone: 'UTC' }) + ' UTC';
};

const keyboardMain = (taskId: string) => ({
  inline_keyboard: [
    [
      { text: '⏳ Отложить', callback_data: `snooze:${taskId}` },
      { text: '✅ Выполнить', callback_data: `done:${taskId}` }
    ],
    [{ text: '🤖 Написать ИИ', callback_data: `ai:${taskId}` }]
  ]
});

const keyboardBackTask = (taskId: string) => ({
  inline_keyboard: [[{ text: '⬅️ Назад', callback_data: `backtask:${taskId}` }]]
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
    reply_markup: replyMarkup
  });
};

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
  const description = escapeHtml(task.description ?? 'Без описания');
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
    lines.push(`${escapeHtml(task.parentTask?.description ?? 'Без описания')}`);
  } else if (task.subtasks.length > 0) {
    lines.push('', '🗂 <b>Подзадачи</b>');
    for (const subtask of task.subtasks) {
      lines.push(`• <b>${escapeHtml(subtask.title)}</b> — ${formatDate(subtask.dueDate)}`);
    }
  }

  return lines.join('\n');
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
    `${escapeHtml(task.description ?? 'Без описания')}`,
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

  await setSession(chatId, { userId: user.id, mode: 'IDLE', activeTaskId: null });
  await sendMessage(chatId, `✅ <b>Аккаунт подключён.</b>\nТеперь я буду присылать уведомления по задачам, ${escapeHtml(user.name ?? user.username ?? '')} 🙌`);
};

const handleIncomingMessage = async (chatId: string, text: string) => {
  const session = await prisma.telegramSession.findUnique({ where: { chatId } });

  if (text === '/start') {
    await setSession(chatId, { mode: 'IDLE', activeTaskId: null });
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
    await handleLoginInput(chatId, text);
    return;
  }

  if ((session?.mode === 'AI_CHAT' || session?.mode === 'AWAITING_AI_MESSAGE') && session.userId && session.activeTaskId) {
    const question = text.trim();
    if (!question) {
      await sendMessage(chatId, '⚠️ Сообщение пустое. Напишите вопрос ИИ или нажмите «Назад».', keyboardBackTask(session.activeTaskId));
      return;
    }

    const history = await aiAssistantService.listTaskDialog({ userId: session.userId, taskId: session.activeTaskId });
    const result = await aiAssistantService.askTaskAssistant({
      userId: session.userId,
      taskId: session.activeTaskId,
      question,
      history,
      mode: 'fast'
    });

    await aiAssistantService.appendTaskDialogMessages({
      userId: session.userId,
      taskId: session.activeTaskId,
      messages: [
        { role: 'user', content: question },
        { role: 'assistant', content: result.answer }
      ]
    });

    await setSession(chatId, { mode: 'AI_CHAT' });
    await sendMessage(
      chatId,
      `🤖 <b>Ответ ИИ</b>\n\n${escapeHtml(result.answer)}\n\n✍️ Можете отправить следующее сообщение, чтобы продолжить диалог.`,
      keyboardBackTask(session.activeTaskId)
    );
    return;
  }

  await sendMessage(chatId, 'ℹ️ Нажмите <b>/start</b>, чтобы подключить аккаунт или продолжить работу.');
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
    await sendMessage(chatId, '🔐 Отправьте одним сообщением: <b>логин пароль</b>.\n\nПример:\n<code>ivan qwerty123</code>');
    return;
  }

  const [action, taskId, value] = data.split(':');
  const session = await prisma.telegramSession.findUnique({ where: { chatId } });

  if (!session?.userId) {
    await answerCallback(callback.id, 'Сначала авторизуйтесь через /start');
    return;
  }

  if (action === 'snooze') {
    await answerCallback(callback.id);
    await editMessage(chatId, messageId, '⏳ <b>На сколько отложить задачу?</b>', keyboardSnooze(taskId));
    return;
  }

  if (action === 'snooze_set') {
    const minutes = Number(value);
    const task = await prisma.task.findFirst({ where: { id: taskId, userId: session.userId } });
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

  if (action === 'done') {
    await prisma.task.updateMany({
      where: { id: taskId, userId: session.userId },
      data: { status: 'DONE', telegramNotifiedAt: null }
    });
    await answerCallback(callback.id, 'Задача закрыта');
    await editMessage(chatId, messageId, '✅ <b>Задача выполнена и закрыта.</b> Отличная работа!');
    return;
  }

  if (action === 'ai') {
    await setSession(chatId, { mode: 'AWAITING_AI_MESSAGE', activeTaskId: taskId });
    await answerCallback(callback.id);
    await editMessage(chatId, messageId, '🤖 <b>Напишите сообщение для ИИ</b>\n\nЯ отправлю его в диалог задачи.', keyboardBackTask(taskId));
    return;
  }

  if (action === 'backtask') {
    await setSession(chatId, { mode: 'IDLE', activeTaskId: null });
    const text = session.userId ? await getTaskNotificationText(taskId, session.userId) : null;
    await answerCallback(callback.id);
    if (text) {
      await editMessage(chatId, messageId, text, keyboardMain(taskId));
    } else {
      await editMessage(chatId, messageId, '⬅️ Возврат в меню уведомления.', keyboardMain(taskId));
    }
  }
};

export const telegramService = {
  isEnabled,
  isWebhookAuthorized(headers: Record<string, unknown>) {
    if (!WEBHOOK_SECRET) return true;
    const header = String(headers['x-telegram-bot-api-secret-token'] ?? '');
    return header === WEBHOOK_SECRET;
  },
  async processWebhookUpdate(update: TelegramUpdate) {
    try {
      if (update.callback_query) {
        await handleCallback(update);
        return;
      }

      if (update.message?.text) {
        const chatId = String(update.message.chat.id);
        await handleIncomingMessage(chatId, update.message.text);
      }
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
      const notifyWindowMs = (task.notifyBeforeMinutes ?? 0) * 60_000;
      const isShining = diffMs > 0 && diffMs <= notifyWindowMs;

      if (isShining && !task.telegramNotifiedAt) {
        const text = await getTaskNotificationText(task.id, task.userId);
        if (text && task.user.telegramChatId) {
          await sendMessage(task.user.telegramChatId, text, keyboardMain(task.id));
          await prisma.task.update({ where: { id: task.id }, data: { telegramNotifiedAt: now } });
        }
      }

      if (!isShining && task.telegramNotifiedAt) {
        await prisma.task.update({ where: { id: task.id }, data: { telegramNotifiedAt: null } });
      }
    }
  },
  async notifyOverdueTaskAiMessage(input: { taskId: string; userId: string; aiMessage: string }) {
    if (!BOT_TOKEN) return;
    if (!input.aiMessage.trim()) return;
    await sendOverdueTaskNotification(input.taskId, input.userId, input.aiMessage);
  }
};
