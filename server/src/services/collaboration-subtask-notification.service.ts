import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { telegramFetch } from '../lib/telegram-fetch.js';

const TELEGRAM_API = 'https://api.telegram.org';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

export const formatCollaborativeSubtaskCompletedNotification = (input: {
  actorName: string;
  subtaskTitle: string;
  taskTitle: string;
}) => `${input.actorName} закрыл вашу подзадачу «${input.subtaskTitle}» в совместной задаче «${input.taskTitle}»`;

export async function notifyCollaborativeSubtaskCompleted(input: {
  subtaskId: string;
  actorUserId: string;
}) {
  try {
    const [subtask, actor] = await Promise.all([
      prisma.task.findUnique({
        where: { id: input.subtaskId },
        select: {
          id: true,
          title: true,
          userId: true,
          collaborationId: true,
          updatedAt: true,
          user: { select: { telegramChatId: true } },
          parentTask: { select: { id: true, title: true } }
        }
      }),
      prisma.user.findUnique({
        where: { id: input.actorUserId },
        select: { name: true, username: true, email: true }
      })
    ]);

    if (!subtask?.parentTask || !subtask.collaborationId || subtask.userId === input.actorUserId) return;

    const recipientMembership = await prisma.collaborativeTaskMember.findUnique({
      where: {
        collaborationId_userId: {
          collaborationId: subtask.collaborationId,
          userId: subtask.userId
        }
      },
      select: { id: true }
    });
    if (!recipientMembership) return;

    const actorName = actor?.name || actor?.username || actor?.email || 'Участник';
    const content = formatCollaborativeSubtaskCompletedNotification({
      actorName,
      subtaskTitle: subtask.title,
      taskTitle: subtask.parentTask.title
    });
    const eventKey = `collaboration-subtask-completed:${subtask.id}:${subtask.updatedAt.getTime()}`;

    try {
      await prisma.systemNotification.create({
        data: {
          userId: subtask.userId,
          taskId: subtask.parentTask.id,
          eventKey,
          content
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      console.error('[Collaboration notification] system notification insert failed', {
        subtaskId: subtask.id,
        actorUserId: input.actorUserId,
        recipientUserId: subtask.userId,
        error
      });
    }

    if (!BOT_TOKEN || !subtask.user.telegramChatId) return;

    try {
      const telegramText = `${escapeHtml(actorName)} закрыл вашу подзадачу <b>${escapeHtml(subtask.title)}</b> в совместной задаче <b>${escapeHtml(subtask.parentTask.title)}</b>`;
      const response = await telegramFetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: subtask.user.telegramChatId,
          text: telegramText,
          parse_mode: 'HTML'
        })
      });
      if (!response.ok) {
        const responseText = await response.text();
        console.error('[Collaboration notification] Telegram API error', {
          subtaskId: subtask.id,
          recipientUserId: subtask.userId,
          status: response.status,
          response: responseText.slice(0, 500)
        });
      }
    } catch (error) {
      console.error('[Collaboration notification] Telegram delivery failed', {
        subtaskId: subtask.id,
        recipientUserId: subtask.userId,
        error
      });
    }
  } catch (error) {
    console.error('[Collaboration notification] preparation failed', {
      subtaskId: input.subtaskId,
      actorUserId: input.actorUserId,
      error
    });
  }
}
