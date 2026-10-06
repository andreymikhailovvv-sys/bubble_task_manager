import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { telegramFetch } from '../lib/telegram-fetch.js';

const TELEGRAM_API = 'https://api.telegram.org';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const MAX_COMMENT_LENGTH = 4000;

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const displayName = (user: { name: string | null; username: string | null; email: string | null }) =>
  user.name || user.username || user.email || 'Участник';

const getAccessibleCollaborativeSubtask = async (taskId: string, userId: string) =>
  prisma.task.findFirstOrThrow({
    where: {
      id: taskId,
      parentTaskId: { not: null },
      collaborationId: { not: null },
      collaboration: { members: { some: { userId, isHidden: false } } }
    },
    select: {
      id: true,
      title: true,
      userId: true,
      collaborationId: true,
      parentTask: { select: { id: true, title: true } },
      user: { select: { telegramChatId: true } }
    }
  });

export const formatCollaborativeSubtaskCommentNotification = (input: {
  actorName: string;
  subtaskTitle: string;
  comment: string;
}) => `Пользователь ${input.actorName} оставил комментарий по подзадаче «${input.subtaskTitle}»: ${input.comment}`;

async function notifySubtaskCreator(input: {
  commentId: string;
  task: Awaited<ReturnType<typeof getAccessibleCollaborativeSubtask>>;
  actorUserId: string;
  actorName: string;
  content: string;
}) {
  if (input.task.userId === input.actorUserId) return;

  const recipientMembership = await prisma.collaborativeTaskMember.findUnique({
    where: {
      collaborationId_userId: {
        collaborationId: input.task.collaborationId!,
        userId: input.task.userId
      }
    },
    select: { isHidden: true }
  });
  if (!recipientMembership || recipientMembership.isHidden) return;

  const notificationContent = formatCollaborativeSubtaskCommentNotification({
    actorName: input.actorName,
    subtaskTitle: input.task.title,
    comment: input.content
  });

  try {
    await prisma.systemNotification.create({
      data: {
        userId: input.task.userId,
        taskId: input.task.parentTask!.id,
        eventKey: `collaboration-subtask-comment:${input.commentId}`,
        content: notificationContent
      }
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
      console.error('[Subtask comment] system notification failed', {
        commentId: input.commentId,
        taskId: input.task.id,
        recipientUserId: input.task.userId,
        error
      });
    }
  }

  if (!BOT_TOKEN || !input.task.user.telegramChatId) return;

  try {
    const telegramText = `Пользователь <b>${escapeHtml(input.actorName)}</b> оставил комментарий по подзадаче <b>${escapeHtml(input.task.title)}</b>: ${escapeHtml(input.content)}`;
    const response = await telegramFetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: input.task.user.telegramChatId,
        text: telegramText,
        parse_mode: 'HTML'
      })
    });
    if (!response.ok) {
      console.error('[Subtask comment] Telegram API error', {
        commentId: input.commentId,
        taskId: input.task.id,
        recipientUserId: input.task.userId,
        status: response.status,
        response: (await response.text()).slice(0, 500)
      });
    }
  } catch (error) {
    console.error('[Subtask comment] Telegram delivery failed', {
      commentId: input.commentId,
      taskId: input.task.id,
      recipientUserId: input.task.userId,
      error
    });
  }
}

export const taskCommentService = {
  list: async (taskId: string, userId: string) => {
    await getAccessibleCollaborativeSubtask(taskId, userId);
    const comments = await prisma.taskComment.findMany({
      where: { taskId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { user: { select: { name: true, username: true, email: true } } }
    });
    return comments.map(({ user, ...comment }) => ({
      ...comment,
      authorName: displayName(user),
      authorUserId: comment.userId,
      isOwn: comment.userId === userId
    }));
  },

  create: async (taskId: string, userId: string, rawContent: unknown, rawParentCommentId?: unknown) => {
    const content = typeof rawContent === 'string' ? rawContent.trim() : '';
    if (!content) throw new TypeError('Comment text is required');
    if (content.length > MAX_COMMENT_LENGTH) throw new TypeError(`Comment is too long (max ${MAX_COMMENT_LENGTH})`);

    const task = await getAccessibleCollaborativeSubtask(taskId, userId);
    const parentCommentId = typeof rawParentCommentId === 'string' && rawParentCommentId.trim()
      ? rawParentCommentId.trim()
      : null;

    if (parentCommentId) {
      await prisma.taskComment.findFirstOrThrow({ where: { id: parentCommentId, taskId } });
    }

    const comment = await prisma.taskComment.create({
      data: { taskId, userId, parentCommentId, content },
      include: { user: { select: { name: true, username: true, email: true } } }
    });
    const actorName = displayName(comment.user);

    await prisma.taskCommentReadState.upsert({
      where: { taskId_userId: { taskId, userId } },
      create: { taskId, userId, lastReadAt: comment.createdAt },
      update: { lastReadAt: comment.createdAt }
    });

    await notifySubtaskCreator({
      commentId: comment.id,
      task,
      actorUserId: userId,
      actorName,
      content
    });

    return {
      ...comment,
      authorName: actorName,
      authorUserId: comment.userId,
      isOwn: true
    };
  },

  markRead: async (taskId: string, userId: string) => {
    await getAccessibleCollaborativeSubtask(taskId, userId);
    const latest = await prisma.taskComment.findFirst({
      where: { taskId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true }
    });
    const lastReadAt = latest?.createdAt ?? new Date();
    await prisma.taskCommentReadState.upsert({
      where: { taskId_userId: { taskId, userId } },
      create: { taskId, userId, lastReadAt },
      update: { lastReadAt }
    });
    return { ok: true as const, lastReadAt };
  }
};
