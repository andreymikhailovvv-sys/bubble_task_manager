import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { telegramFetch } from '../lib/telegram-fetch.js';
import { buildMiniAppTaskCommentsUrl } from '../lib/miniapp-url.js';

const TELEGRAM_API = 'https://api.telegram.org';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const MAX_COMMENT_LENGTH = 3000;
const MAX_COMMENT_ATTACHMENTS = 3;
const MAX_COMMENT_ATTACHMENT_SIZE = 3 * 1024 * 1024;
const COMMENT_ATTACHMENT_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

type CommentAttachmentInput = {
  name: string;
  mimeType: string;
  size: number;
  contentBase64: string;
};

const normalizeCommentAttachments = (raw: unknown): CommentAttachmentInput[] => {
  if (!Array.isArray(raw)) return [];
  if (raw.length > MAX_COMMENT_ATTACHMENTS) throw new TypeError(`Too many comment attachments (max ${MAX_COMMENT_ATTACHMENTS})`);
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object') throw new TypeError(`Invalid comment attachment #${index + 1}`);
    const value = item as Record<string, unknown>;
    const name = typeof value.name === 'string' ? value.name.trim().slice(0, 180) : '';
    const mimeType = typeof value.mimeType === 'string' ? value.mimeType.trim().toLowerCase() : '';
    const size = typeof value.size === 'number' ? value.size : Number(value.size);
    const contentBase64 = typeof value.contentBase64 === 'string' ? value.contentBase64.trim() : '';
    const roundedSize = Math.round(size);
    const decodedSize = contentBase64 ? Buffer.from(contentBase64, 'base64').byteLength : 0;
    if (!name || !COMMENT_ATTACHMENT_MIME_TYPES.has(mimeType) || !Number.isFinite(size) || roundedSize <= 0 || roundedSize > MAX_COMMENT_ATTACHMENT_SIZE || !contentBase64 || decodedSize !== roundedSize) {
      throw new TypeError('Comment attachments must be valid PNG/JPEG/WEBP screenshots up to 3MB each');
    }
    return { name, mimeType, size: roundedSize, contentBase64 };
  });
};

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
      user: { select: { telegramChatId: true } },
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

export const formatCollaborativeSubtaskCommentNotification = (input: {
  actorName: string;
  subtaskTitle: string;
  comment: string;
  isReply?: boolean;
}) => input.isReply
  ? `Пользователь ${input.actorName} ответил на ваш комментарий по подзадаче «${input.subtaskTitle}»: ${input.comment}`
  : `Пользователь ${input.actorName} оставил комментарий по подзадаче «${input.subtaskTitle}»: ${input.comment}`;

async function notifyCommentRecipient(input: {
  commentId: string;
  task: Awaited<ReturnType<typeof getAccessibleCollaborativeSubtask>>;
  actorUserId: string;
  actorName: string;
  content: string;
  recipientUserId: string;
  isReply: boolean;
}) {
  if (input.recipientUserId === input.actorUserId) return;

  const recipient = input.task.collaboration?.members.find((member) => member.userId === input.recipientUserId);
  if (!recipient) return;

  const notificationContent = formatCollaborativeSubtaskCommentNotification({
    actorName: input.actorName,
    subtaskTitle: input.task.title,
    comment: input.content,
    isReply: input.isReply
  });

  try {
    await prisma.systemNotification.create({
      data: {
        userId: input.recipientUserId,
        taskId: input.task.parentTask!.id,
        eventKey: `collaboration-subtask-comment:${input.commentId}:${input.recipientUserId}`,
        content: notificationContent
      }
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
      console.error('[Subtask comment] system notification failed', {
        commentId: input.commentId,
        taskId: input.task.id,
        recipientUserId: input.recipientUserId,
        error
      });
    }
  }

  if (!BOT_TOKEN || !recipient.user.telegramChatId) return;

  try {
    const telegramText = input.isReply
      ? `Пользователь <b>${escapeHtml(input.actorName)}</b> ответил на ваш комментарий по подзадаче <b>${escapeHtml(input.task.title)}</b>: ${escapeHtml(input.content)}`
      : `Пользователь <b>${escapeHtml(input.actorName)}</b> оставил комментарий по подзадаче <b>${escapeHtml(input.task.title)}</b>: ${escapeHtml(input.content)}`;
    const response = await telegramFetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: recipient.user.telegramChatId,
        text: telegramText,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{
            text: 'Ответить',
            web_app: { url: buildMiniAppTaskCommentsUrl(input.task.parentTask!.id, input.task.id) }
          }]]
        }
      })
    });
    if (!response.ok) {
      console.error('[Subtask comment] Telegram API error', {
        commentId: input.commentId,
        taskId: input.task.id,
        recipientUserId: input.recipientUserId,
        status: response.status,
        response: (await response.text()).slice(0, 500)
      });
    }
  } catch (error) {
    console.error('[Subtask comment] Telegram delivery failed', {
      commentId: input.commentId,
      taskId: input.task.id,
      recipientUserId: input.recipientUserId,
      error
    });
  }
}

export const taskCommentService = {
  list: async (taskId: string, userId: string) => {
    const task = await getAccessibleCollaborativeSubtask(taskId, userId);
    const comments = await prisma.taskComment.findMany({
      where: { taskId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        user: { select: { name: true, username: true, email: true } },
        attachments: { select: { id: true, commentId: true, name: true, mimeType: true, size: true, createdAt: true } }
      }
    });
    const memberColorByUserId = new Map(task.collaboration?.members.map((member) => [member.userId, member.color]) ?? []);
    return comments.map(({ user, ...comment }) => ({
      ...comment,
      authorName: displayName(user),
      authorUserId: comment.userId,
      authorColor: memberColorByUserId.get(comment.userId) ?? '#64748b',
      isOwn: comment.userId === userId
    }));
  },

  create: async (taskId: string, userId: string, rawContent: unknown, rawParentCommentId?: unknown, rawAttachments?: unknown) => {
    const content = typeof rawContent === 'string' ? rawContent.trim() : '';
    const attachments = normalizeCommentAttachments(rawAttachments);
    if (!content && attachments.length === 0) throw new TypeError('Comment text or screenshot is required');
    if (content.length > MAX_COMMENT_LENGTH) throw new TypeError(`Comment is too long (max ${MAX_COMMENT_LENGTH})`);

    const task = await getAccessibleCollaborativeSubtask(taskId, userId);
    const parentCommentId = typeof rawParentCommentId === 'string' && rawParentCommentId.trim()
      ? rawParentCommentId.trim()
      : null;

    const parentComment = parentCommentId
      ? await prisma.taskComment.findFirstOrThrow({ where: { id: parentCommentId, taskId }, select: { id: true, userId: true } })
      : null;

    const comment = await prisma.taskComment.create({
      data: {
        taskId,
        userId,
        parentCommentId,
        content,
        ...(attachments.length > 0 ? {
          attachments: {
            create: attachments.map((attachment) => ({
              name: attachment.name,
              mimeType: attachment.mimeType,
              size: attachment.size,
              contentBase64: attachment.contentBase64
            }))
          }
        } : {})
      },
      include: {
        user: { select: { name: true, username: true, email: true } },
        attachments: { select: { id: true, commentId: true, name: true, mimeType: true, size: true, createdAt: true } }
      }
    });
    const actorName = displayName(comment.user);

    await prisma.taskCommentReadState.upsert({
      where: { taskId_userId: { taskId, userId } },
      create: { taskId, userId, lastReadAt: comment.createdAt },
      update: { lastReadAt: comment.createdAt }
    });

    const actorColor = task.collaboration?.members.find((member) => member.userId === userId)?.color ?? '#64748b';
    await notifyCommentRecipient({
      commentId: comment.id,
      task,
      actorUserId: userId,
      actorName,
      content: content || '📎 Скриншот',
      recipientUserId: parentComment?.userId ?? task.userId,
      isReply: Boolean(parentComment)
    });

    return {
      ...comment,
      authorName: actorName,
      authorUserId: comment.userId,
      authorColor: actorColor,
      isOwn: true
    };
  },

  getAttachment: async (taskId: string, userId: string, commentId: string, attachmentId: string) => {
    await getAccessibleCollaborativeSubtask(taskId, userId);
    return prisma.taskCommentAttachment.findFirstOrThrow({
      where: { id: attachmentId, commentId, comment: { taskId } },
      select: { id: true, name: true, mimeType: true, size: true, contentBase64: true }
    });
  },

  markRead: async (taskId: string, userId: string, rawLastCommentId?: unknown) => {
    await getAccessibleCollaborativeSubtask(taskId, userId);
    const lastCommentId = typeof rawLastCommentId === 'string' && rawLastCommentId.trim() ? rawLastCommentId.trim() : null;
    const latest = lastCommentId
      ? await prisma.taskComment.findFirstOrThrow({
          where: { id: lastCommentId, taskId },
          select: { createdAt: true }
        })
      : await prisma.taskComment.findFirst({
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
