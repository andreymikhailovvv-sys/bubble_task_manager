import jwt from 'jsonwebtoken';

export const TASK_ATTACHMENT_DOWNLOAD_PURPOSE = 'task-attachment-download' as const;
export const TASK_ATTACHMENT_DOWNLOAD_TTL_SECONDS = 5 * 60;

type TaskAttachmentDownloadToken = {
  taskId: string;
  attachmentId: string;
  userId: string;
  purpose: typeof TASK_ATTACHMENT_DOWNLOAD_PURPOSE;
};

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required for attachment downloads');
  return secret;
};

export const signTaskAttachmentDownloadToken = (payload: Omit<TaskAttachmentDownloadToken, 'purpose'>) =>
  jwt.sign({ ...payload, purpose: TASK_ATTACHMENT_DOWNLOAD_PURPOSE }, getJwtSecret(), {
    expiresIn: TASK_ATTACHMENT_DOWNLOAD_TTL_SECONDS
  });

export const verifyTaskAttachmentDownloadToken = (token: string): TaskAttachmentDownloadToken => {
  const decoded = jwt.verify(token, getJwtSecret()) as Partial<TaskAttachmentDownloadToken>;
  if (
    decoded.purpose !== TASK_ATTACHMENT_DOWNLOAD_PURPOSE
    || typeof decoded.taskId !== 'string'
    || typeof decoded.attachmentId !== 'string'
    || typeof decoded.userId !== 'string'
  ) {
    throw new Error('Invalid attachment download token');
  }
  return {
    taskId: decoded.taskId,
    attachmentId: decoded.attachmentId,
    userId: decoded.userId,
    purpose: decoded.purpose
  } as TaskAttachmentDownloadToken;
};
