import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { taskService } from '../services/task.service.js';

export const taskController = {
  list: async (req: Request, res: Response) => {
    const data = await taskService.list(req.user!.id);
    const userAgent = req.get('user-agent') ?? 'unknown';
    const isTelegramMiniApp = /Telegram/i.test(userAgent) || /MiniApp/i.test(userAgent);
    if (isTelegramMiniApp) {
      console.info(
        `[MiniApp] tasks list userId=${req.user!.id} username=${req.user!.username ?? '—'} deviceId=${req.user!.deviceId ?? '—'} count=${data.length}`
      );
    }
    res.json(data);
  },
  create: async (req: Request, res: Response) => {
    const item = await taskService.create(req.user!.id, req.body);
    res.status(201).json(item);
  },
  update: async (req: Request, res: Response) => {
    // Track the source of explicit task mutations without logging request bodies or tokens.
    const userAgent = req.get('user-agent') ?? '';
    const surface = /Telegram|MiniApp/i.test(userAgent) ? 'miniapp'
      : /okhttp|PlanirovychAndroid/i.test(userAgent) ? 'android' : 'web';
    const item = await taskService.update(req.params.id, req.user!.id, req.body, {
      source: `api:${surface}`, requestId: randomUUID()
    });
    res.json(item);
  },
  remove: async (req: Request, res: Response) => {
    await taskService.remove(req.params.id, req.user!.id, req.query.scope === 'all' ? 'all' : 'me');
    res.json({ ok: true });
  },
  createShareLink: async (req: Request, res: Response) => {
    res.json(await taskService.createShareLink(req.params.id, req.user!.id));
  },
  sharePreview: async (req: Request, res: Response) => {
    res.json(await taskService.sharePreview(req.params.token));
  },
  acceptShare: async (req: Request, res: Response) => {
    res.json(await taskService.acceptShare(req.params.token, req.user!.id, typeof req.body.sphereId === 'string' ? req.body.sphereId : null));
  },
  updateCollaboration: async (req: Request, res: Response) => {
    res.json(await taskService.updateCollaboration(req.params.id, req.user!.id, String(req.body.color ?? '')));
  },
  removeCollaborator: async (req: Request, res: Response) => {
    res.json(await taskService.removeCollaborator(req.params.id, req.user!.id, req.params.userId));
  },
  disableCollaboration: async (req: Request, res: Response) => {
    res.json(await taskService.disableCollaboration(req.params.id, req.user!.id));
  }
};
