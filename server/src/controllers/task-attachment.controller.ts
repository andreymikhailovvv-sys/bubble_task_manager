import { Request, Response } from 'express';
import { taskAttachmentService } from '../services/task-attachment.service.js';
import { signTaskAttachmentDownloadToken, verifyTaskAttachmentDownloadToken } from '../services/task-attachment-download.service.js';

const publicAppUrl = (req: Request) => {
  const configured = process.env.PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  return (configured || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
};

const sendAttachment = (res: Response, attachment: { name: string; mimeType: string; contentBase64: string }) => {
  const fileBuffer = Buffer.from(attachment.contentBase64, 'base64');
  const fallbackName = attachment.name.replace(/[^\x20-\x7e]|["\\]/g, '_') || 'attachment';
  res.set({
    'Content-Type': attachment.mimeType || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
    'Access-Control-Allow-Origin': 'https://web.telegram.org',
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff'
  });
  res.send(fileBuffer);
};

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
    sendAttachment(res, attachment);
  },
  createDownloadLink: async (req: Request, res: Response) => {
    const attachment = await taskAttachmentService.getContent(req.params.id, req.params.attachmentId, req.user!.id);
    const token = signTaskAttachmentDownloadToken({ taskId: req.params.id, attachmentId: req.params.attachmentId, userId: req.user!.id });
    res.json({
      url: `${publicAppUrl(req)}/api/task-attachments/download?token=${encodeURIComponent(token)}`,
      fileName: attachment.name
    });
  },
  downloadWithToken: async (req: Request, res: Response) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) {
      res.status(401).json({ error: 'Недействительная ссылка скачивания' });
      return;
    }
    let payload;
    try {
      payload = verifyTaskAttachmentDownloadToken(token);
    } catch {
      res.status(401).json({ error: 'Ссылка скачивания недействительна или истекла' });
      return;
    }
    const attachment = await taskAttachmentService.getContent(payload.taskId, payload.attachmentId, payload.userId);
    sendAttachment(res, attachment);
  }
};
