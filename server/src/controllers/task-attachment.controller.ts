import { Request, Response } from 'express';
import { taskAttachmentService } from '../services/task-attachment.service.js';

export const taskAttachmentController = {
  list: async (req: Request, res: Response) => {
    const data = await taskAttachmentService.list(req.params.id, req.user!.id);
    res.json(data);
  },
  create: async (req: Request, res: Response) => {
    const item = await taskAttachmentService.create(req.params.id, req.user!.id, req.body);
    res.status(201).json(item);
  },
  remove: async (req: Request, res: Response) => {
    await taskAttachmentService.remove(req.params.id, req.params.attachmentId, req.user!.id);
    res.json({ ok: true });
  }
};
