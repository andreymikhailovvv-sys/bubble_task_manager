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
      select: { id: true, isHidden: true }
    });
    if (!recipientMembership || recipientMembership.isHidden) return;

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


export const formatCollaborativeSubtaskCreatedNotification = (input: {
  actorName: string;
  subtaskTitle: string;
  taskTitle: string;
}) => `Пользователь ${input.actorName} добавил подзадачу «${input.subtaskTitle}» в совместную задачу «${input.taskTitle}»`;

/**
 * Notify the owner of the shared root, not the newly created child author.
 * The existing website feed also delivers this as a background-tab browser
 * notification when the user has allowed browser notifications.
 */
export async function notifyCollaborativeSubtaskCreated(input: {
  subtaskId: string;
  actorUserId: string;
}) {
  try {
    const [subtask, actor] = await Promise.all([
      prisma.task.findUnique({
        where: { id: input.subtaskId },
        select: {
          id: true, title: true, userId: true, collaborationId: true,
          parentTask: {
            select: { id: true, title: true, userId: true, parentTaskId: true,
              user: { select: { telegramChatId: true } } }
          }
        }
      }),
      prisma.user.findUnique({
        where: { id: input.actorUserId },
        select: { name: true, username: true, email: true }
      })
    ]);
    const parent = subtask?.parentTask;
    if (!subtask?.collaborationId || !parent || parent.parentTaskId ||
        subtask.userId !== input.actorUserId || parent.userId === input.actorUserId) return;

    const memberships = await prisma.collaborativeTaskMember.findMany({
      where: {
        collaborationId: subtask.collaborationId,
        userId: { in: [parent.userId, input.actorUserId] },
        isHidden: false
      },
      select: { userId: true }
    });
    if (!memberships.some(member => member.userId === parent.userId) ||
        !memberships.some(member => member.userId === input.actorUserId)) return;

    const actorName = actor?.name || actor?.username || actor?.email || 'Участник';
    const content = formatCollaborativeSubtaskCreatedNotification({
      actorName, subtaskTitle: subtask.title, taskTitle: parent.title
    });
    const eventKey = `collaboration-subtask-created:${subtask.id}:${parent.userId}`;
    // Only the caller that inserted the unique event may send Telegram.
    try {
      await prisma.systemNotification.create({
        data: { userId: parent.userId, taskId: parent.id, eventKey, content }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      console.error('[Collaboration subtask created] system notification failed', {
        subtaskId: subtask.id, recipientUserId: parent.userId, error
      });
      return;
    }

    if (!BOT_TOKEN || !parent.user.telegramChatId) return;
    try {
      const telegramText = `Пользователь <b>${escapeHtml(actorName)}</b> добавил подзадачу <b>${escapeHtml(subtask.title)}</b> в совместную задачу <b>${escapeHtml(parent.title)}</b>`;
      const response = await telegramFetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: parent.user.telegramChatId,
          text: telegramText,
          parse_mode: 'HTML'
        })
      });
      if (!response.ok) console.error('[Collaboration subtask created] Telegram API error', {
        subtaskId: subtask.id, recipientUserId: parent.userId, status: response.status
      });
    } catch (error) {
      console.error('[Collaboration subtask created] Telegram delivery failed', {
        subtaskId: subtask.id, recipientUserId: parent.userId, error
      });
    }
  } catch (error) {
    console.error('[Collaboration subtask created] preparation failed', {
      subtaskId: input.subtaskId, actorUserId: input.actorUserId, error
    });
  }
}
