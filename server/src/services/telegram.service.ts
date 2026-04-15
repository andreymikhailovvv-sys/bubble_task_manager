import { authService } from '../auth/auth.service.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { aiAssistantService } from './ai-assistant.service.js';

const TELEGRAM_API = 'https://api.telegram.org';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const MENU_CREATE_AI_TASK = '🤖 Создать задачу ИИ';
const MENU_LIST_TASKS = '📋 Посмотреть задачи';

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

const isEnabled = () => Boolean(BOT_TOKEN);

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const formatAiTextWithBold = (value: string) => {
  const escaped = escapeHtml(value);
  return escaped.replace(/\*\*(.+?)\*\*/gs, '<b>$1</b>');
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
  return value.toLocaleString('ru-RU', { timeZone: 'UTC' });
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

const keyboardTaskDetails = (taskId: string) => ({
  inline_keyboard: [
    [
      { text: '✅ Выполнить', callback_data: `done:${taskId}` },
      { text: '🗑 Удалить', callback_data: `delete:${taskId}` }
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

const keyboardReplyMain = {
  keyboard: [[{ text: MENU_CREATE_AI_TASK }], [{ text: MENU_LIST_TASKS }]],
  resize_keyboard: true,
  one_time_keyboard: false,
  is_persistent: false
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

const getTaskDetailsText = async (taskId: string, userId: string, taskIndex?: number) => {
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

  const subtaskLines = task.subtasks.length
    ? task.subtasks.map((subtask, index) => {
      const title = escapeHtml(subtask.title);
      const decoratedTitle = subtask.status === 'DONE' ? `<s>${title}</s>` : title;
      return `${index + 1}. ${subtask.status === 'DONE' ? '✅' : '▫️'} ${decoratedTitle}`;
    })
    : ['— подзадач пока нет'];

  const lines = [
    subtitle,
    '',
    `📍 <b>${escapeHtml(task.title)}</b>`,
    '',
    '🧩 <b>Описание подзадачи</b>',
    escapeHtml(task.description?.trim() || 'Без описания'),
    '',
    `⏳ <b>Дедлайн:</b> ${escapeHtml(formatDate(task.dueDate))}`,
    '',
    '☑️ <b>Подзадачи:</b>',
    ...subtaskLines
  ];

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

const resetBotMenuState = async (chatId: string) => {
  listTaskIdsByChatId.delete(chatId);
  pendingAiAttachmentByChatId.delete(chatId);
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
    `✅ <b>Аккаунт подключён.</b>\nТеперь я буду присылать уведомления по задачам, ${escapeHtml(user.name ?? user.username ?? '')} 🙌\n\nВыберите действие в меню ⤵️`,
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
    attachments: attachment ? [attachment] : []
  });

  const importance = generated.task.importance ?? 3;
  const urgency = generated.task.urgency ?? 3;

  const createdTask = await prisma.task.create({
    data: {
      title: generated.task.title,
      description: generated.task.description,
      userId,
      sphereId: null,
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
        notifyBeforeMinutes: 60
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

const loadTelegramAttachment = async (message: TelegramUpdate['message']): Promise<ChatAttachment | null> => {
  if (!BOT_TOKEN || !message) return null;

  const document = message.document;
  const photo = Array.isArray(message.photo) && message.photo.length > 0
    ? message.photo[message.photo.length - 1]
    : null;

  const candidate = document ?? photo;
  if (!candidate?.file_id) return null;

  const resolvedMimeType = document?.mime_type || 'image/jpeg';
  const resolvedName = document?.file_name?.trim() || `telegram-file-${Date.now()}.${document ? 'bin' : 'jpg'}`;

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
  const descriptionText = text || caption;

  const session = await prisma.telegramSession.findUnique({ where: { chatId } });

  if (descriptionText === '/start') {
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

  if (descriptionText === MENU_CREATE_AI_TASK) {
    pendingAiAttachmentByChatId.delete(chatId);
    await setSession(chatId, { mode: 'AWAITING_AI_TASK_PROMPT', activeTaskId: null });
    await sendMessage(
      chatId,
      '🤖 <b>Создание задачи через ИИ</b>\n\nОтправьте описание задачи текстом. Можно сразу прикрепить файл — я учту его при формировании задачи.',
      keyboardReplyMain
    );
    return;
  }

  if (descriptionText === MENU_LIST_TASKS) {
    await setSession(chatId, { mode: 'VIEWING_TASK_LIST', activeTaskId: null });
    const listParts = await buildTaskListTextParts(session.userId, chatId);
    for (const listPart of listParts) {
      await sendMessage(chatId, listPart, keyboardReplyMain);
    }
    return;
  }

  if ((session.mode === 'AI_CHAT' || session.mode === 'AWAITING_AI_MESSAGE') && session.activeTaskId) {
    const question = descriptionText;
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
    const taskText = await getTaskDetailsText(taskId, session.userId, selectedIndex);
    if (!taskText) {
      await sendMessage(chatId, '⚠️ Не удалось найти задачу. Обновите список через «📋 Посмотреть задачи».', keyboardReplyMain);
      return;
    }

    await sendMessage(chatId, taskText, keyboardTaskDetails(taskId));
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

    await sendMessage(chatId, '🧠 Формирую задачу через ИИ...');

    try {
      const created = await createTaskFromAiPrompt(session.userId, prompt, attachment);
      pendingAiAttachmentByChatId.delete(chatId);
      await resetBotMenuState(chatId);

      const dueDateLabel = created.createdTask.dueDate ? formatDate(created.createdTask.dueDate) : 'не указан';
      const lines = [
        '✅ <b>Задача создана!</b>',
        '',
        `🧩 <b>${escapeHtml(created.createdTask.title)}</b>`,
        `${escapeHtml(created.createdTask.description ?? 'Без описания')}`,
        `⏰ Дедлайн: <b>${escapeHtml(dueDateLabel)}</b>`,
        `🗂 Подзадач: <b>${created.generated.task.subtasks.length}</b>`,
        attachment ? '📎 Файл прикреплён к задаче.' : '📎 Файл не прикреплялся.',
        '',
        `🤖 <b>Первое сообщение ИИ:</b>\n${formatAiTextWithBold(created.generated.firstAssistantMessage)}`
      ];

      await sendMessage(chatId, lines.join('\n'), keyboardReplyMain);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось создать задачу через ИИ.';
      await sendMessage(chatId, `❌ ${escapeHtml(message)}`, keyboardReplyMain);
      return;
    }
  }

  await sendMessage(chatId, 'ℹ️ Выберите действие через меню: «🤖 Создать задачу ИИ» или «📋 Посмотреть задачи».', keyboardReplyMain);
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

  if (action === 'delete') {
    const deleted = await prisma.task.deleteMany({
      where: { id: taskId, userId: session.userId }
    });
    await answerCallback(callback.id, deleted.count ? 'Задача удалена' : 'Задача не найдена');
    await setSession(chatId, { mode: 'IDLE', activeTaskId: null });
    await editMessage(chatId, messageId, deleted.count ? '🗑 <b>Задача удалена.</b>' : '⚠️ <b>Задача не найдена.</b>');
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
    const taskIds = listTaskIdsByChatId.get(chatId) ?? [];
    const index = taskIds.findIndex((id) => id === taskId);
    const text = session.userId ? await getTaskDetailsText(taskId, session.userId, index >= 0 ? index + 1 : undefined) : null;
    await answerCallback(callback.id);
    if (text) {
      await editMessage(chatId, messageId, text, keyboardTaskDetails(taskId));
    } else {
      await editMessage(chatId, messageId, '⬅️ Возврат в меню уведомления.', keyboardTaskDetails(taskId));
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

      if (update.message) {
        await handleIncomingMessage(update.message);
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
