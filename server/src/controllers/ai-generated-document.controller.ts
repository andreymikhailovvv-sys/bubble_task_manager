import type { Request, Response } from 'express';
import { wordDocumentService } from '../services/word-document.service.js';

const encodeContentDispositionFileName = (value: string) =>
  encodeURIComponent(value).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

export const aiGeneratedDocumentController = {
  download: async (req: Request, res: Response) => {
    const document = await wordDocumentService.getForDownload(req.user!.id, req.params.id);
    if (!document) {
      res.status(404).json({ error: 'Документ не найден' });
      return;
    }
    const buffer = Buffer.from(document.contentBase64, 'base64');
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeContentDispositionFileName(document.fileName)}`);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(buffer);
  }
};
