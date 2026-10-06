import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { telegramFetch } from '../lib/telegram-fetch.js';
import { buildMiniAppTaskAiUrl } from '../lib/miniapp-url.js';

const TELEGRAM_API = 'https://api.telegram.org';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const MAX_MESSAGE_LENGTH = 3000;

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const displayName = (user: { name: string | null; username: string | null; email: string | null }) =>
  user.name || user.username || user.email || 'Участник';

export const formatParticipantMessageNotification = (input: {
  actorName: string;
  taskTitle: string;
  content: string;
}) => `Пользователь ${input.actorName} написал вам в совместной задаче «${input.taskTitle}»: ${input.content}`;

export const taskParticipantMessageService = {
  send: async (input: { taskId: string; senderUserId: string; recipientUserId: string; content: unknown }) => {
    const content = typeof input.content === 'string' ? input.content.trim() : '';
    if (!content) throw new TypeError('Message text is required');
    if (content.length > MAX_MESSAGE_LENGTH) throw new TypeError(`Message is too long (max ${MAX_MESSAGE_LENGTH})`);
    if (input.recipientUserId === input.senderUserId) throw new TypeError('Recipient must be another participant');

    const task = await prisma.task.findFirstOrThrow({
      where: {
        id: input.taskId,
        parentTaskId: null,
        collaborationId: { not: null },
        collaboration: { members: { some: { userId: input.senderUserId, isHidden: false } } }
      },
      select: {
        id: true,
        title: true,
        collaborationId: true,
        collaboration: {
          select: {
            members: {
              where: { isHidden: false },
              select: {
                userId: true,
                color: true,
                user: { select: { name: true, username: true, email: true, telegramChatId: true } }
              }
            }
          }
        }
      }
    });

    const sender = task.collaboration!.members.find((member) => member.userId === input.senderUserId);
    const recipient = task.collaboration!.members.find((member) => member.userId === input.recipientUserId);
    if (!sender || !recipient) throw new TypeError('Recipient is not an active participant');

    const message = await prisma.taskAiMessage.create({
      data: {
        taskId: task.id,
        userId: input.senderUserId,
        role: 'user',
        content,
        messageKind: 'HUMAN',
        recipientUserId: input.recipientUserId
      }
    });

    const actorName = displayName(sender.user);
    const recipientName = displayName(recipient.user);
    const notificationContent = formatParticipantMessageNotification({
      actorName,
      taskTitle: task.title,
      content
    });

    try {
      await prisma.systemNotification.create({
        data: {
          userId: recipient.userId,
          taskId: task.id,
          eventKey: `collaboration-direct-message:${message.id}`,
          content: notificationContent
        }
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        console.error('[Collaboration message] system notification failed', { taskId: task.id, messageId: message.id, error });
      }
    }

    if (BOT_TOKEN && recipient.user.telegramChatId) {
      try {
        const response = await telegramFetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: recipient.user.telegramChatId,
            text: `Пользователь <b>${escapeHtml(actorName)}</b> написал вам в совместной задаче <b>${escapeHtml(task.title)}</b>: ${escapeHtml(content)}`,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{
                text: 'Ответить',
                web_app: { url: buildMiniAppTaskAiUrl(task.id, input.senderUserId) }
              }]]
            }
          })
        });
        if (!response.ok) {
          console.error('[Collaboration message] Telegram API error', {
            taskId: task.id,
            messageId: message.id,
            status: response.status,
            response: (await response.text()).slice(0, 500)
          });
        }
      } catch (error) {
        console.error('[Collaboration message] Telegram delivery failed', { taskId: task.id, messageId: message.id, error });
      }
    }

    return {
      id: message.id,
      role: 'user' as const,
      content: message.content,
      authorName: actorName,
      authorColor: sender.color,
      messageKind: 'HUMAN' as const,
      recipientUserId: recipient.userId,
      recipientName
    };
  }
};
