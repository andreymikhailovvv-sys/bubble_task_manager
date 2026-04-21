import { Request, Response } from 'express';
import { sphereService } from '../services/sphere.service.js';

export const sphereController = {
  list: async (req: Request, res: Response) => {
    const data = await sphereService.list(req.user!.id);
    const userAgent = req.get('user-agent') ?? 'unknown';
    const isTelegramMiniApp = /Telegram/i.test(userAgent) || /MiniApp/i.test(userAgent);
    if (isTelegramMiniApp) {
      console.info(`[MiniApp] spheres list userId=${req.user!.id} count=${data.length}`);
    }
    res.json(data);
  },
  create: async (req: Request, res: Response) => {
    try {
      const item = await sphereService.create(req.user!.id, req.body);
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('MAX_SPHERES:')) {
        res.status(400).json({ error: 'Достигнут лимит: максимум 8 секторов.' });
        return;
      }
      throw error;
    }
  },
  update: async (req: Request, res: Response) => {
    const item = await sphereService.update(req.params.id, req.user!.id, req.body);
    res.json(item);
  },
  remove: async (req: Request, res: Response) => {
    await sphereService.remove(req.params.id, req.user!.id);
    res.json({ ok: true });
  }
};
