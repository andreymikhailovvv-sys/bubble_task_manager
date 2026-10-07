import type { Request, Response } from 'express';
import { taskCommentService } from '../services/task-comment.service.js';

export const taskCommentController = {
  list: async (req: Request, res: Response) => {
    res.json({ comments: await taskCommentService.list(req.params.id, req.user!.id) });
  },
  create: async (req: Request, res: Response) => {
    const comment = await taskCommentService.create(
      req.params.id,
      req.user!.id,
      req.body?.content,
      req.body?.parentCommentId,
      req.body?.attachments
    );
    res.status(201).json(comment);
  },
  downloadAttachment: async (req: Request, res: Response) => {
    const attachment = await taskCommentService.getAttachment(
      req.params.id,
      req.user!.id,
      req.params.commentId,
      req.params.attachmentId
    );
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Length', String(attachment.size));
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(attachment.name)}`);
    res.send(Buffer.from(attachment.contentBase64, 'base64'));
  },
  markRead: async (req: Request, res: Response) => {
    res.json(await taskCommentService.markRead(req.params.id, req.user!.id, req.body?.lastCommentId));
  }
};
