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
      req.body?.parentCommentId
    );
    res.status(201).json(comment);
  },
  markRead: async (req: Request, res: Response) => {
    res.json(await taskCommentService.markRead(req.params.id, req.user!.id, req.body?.lastCommentId));
  },
  markAllRead: async (req: Request, res: Response) => {
    res.json(await taskCommentService.markAllRead(req.params.id, req.user!.id));
  }
};
