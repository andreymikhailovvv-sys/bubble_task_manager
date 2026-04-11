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
  },
  download: async (req: Request, res: Response) => {
    const attachment = await taskAttachmentService.getContent(req.params.id, req.params.attachmentId, req.user!.id);
    const fileBuffer = Buffer.from(attachment.contentBase64, 'base64');
    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`);
    res.send(fileBuffer);
  }
};
