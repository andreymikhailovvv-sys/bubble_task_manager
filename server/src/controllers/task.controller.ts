import { Request, Response } from 'express';
import { taskService } from '../services/task.service.js';

export const taskController = {
  list: async (req: Request, res: Response) => {
    const data = await taskService.list(req.user!.id);
    const userAgent = req.get('user-agent') ?? 'unknown';
    const isTelegramMiniApp = /Telegram/i.test(userAgent) || /MiniApp/i.test(userAgent);
    if (isTelegramMiniApp) {
      console.info(`[MiniApp] tasks list userId=${req.user!.id} count=${data.length}`);
    }
    res.json(data);
  },
  create: async (req: Request, res: Response) => {
    const item = await taskService.create(req.user!.id, req.body);
    res.status(201).json(item);
  },
  update: async (req: Request, res: Response) => {
    const item = await taskService.update(req.params.id, req.user!.id, req.body);
    res.json(item);
  },
  remove: async (req: Request, res: Response) => {
    await taskService.remove(req.params.id, req.user!.id);
    res.json({ ok: true });
  }
};
