import type { Request, Response } from 'express';
import { wordDocumentService } from '../services/word-document.service.js';
import { signAiDocumentDownloadToken, verifyAiDocumentDownloadToken } from '../services/ai-generated-document-download.service.js';

const encodeContentDispositionFileName = (value: string) =>
  encodeURIComponent(value).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

const publicAppUrl = (req: Request) => {
  const configured = process.env.PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  return (configured || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
};

const sendDocument = (res: Response, document: { fileName: string; mimeType: string; contentBase64: string }) => {
  const buffer = Buffer.from(document.contentBase64, 'base64');
  res.setHeader('Content-Type', document.mimeType);
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeContentDispositionFileName(document.fileName)}`);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(buffer);
};

export const aiGeneratedDocumentController = {
  download: async (req: Request, res: Response) => {
    const document = await wordDocumentService.getForDownload(req.user!.id, req.params.id);
    if (!document) {
      res.status(404).json({ error: 'Документ не найден' });
      return;
    }
    sendDocument(res, document);
  },

  createDownloadLink: async (req: Request, res: Response) => {
    const document = await wordDocumentService.getForDownload(req.user!.id, req.params.id);
    if (!document) {
      res.status(404).json({ error: 'Документ не найден' });
      return;
    }
    const token = signAiDocumentDownloadToken({ documentId: document.id, userId: req.user!.id });
    res.json({
      url: `${publicAppUrl(req)}/api/ai-documents/download?token=${encodeURIComponent(token)}`,
      fileName: document.fileName
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
      payload = verifyAiDocumentDownloadToken(token);
    } catch {
      res.status(401).json({ error: 'Ссылка скачивания недействительна или истекла' });
      return;
    }

    const document = await wordDocumentService.getForDownload(payload.userId, payload.documentId);
    if (!document) {
      res.status(404).json({ error: 'Документ не найден' });
      return;
    }
    sendDocument(res, document);
  }
};
