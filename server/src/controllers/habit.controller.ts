import { Request, Response } from 'express';
import { habitService } from '../services/habit.service.js';

export const habitController = {
  list: async (req: Request, res: Response) => {
    res.json(await habitService.list(req.user!.id));
  },
  create: async (req: Request, res: Response) => {
    res.status(201).json(await habitService.create(req.user!.id, req.body));
  },
  update: async (req: Request, res: Response) => {
    res.json(await habitService.update(req.params.id, req.user!.id, req.body));
  },
  complete: async (req: Request, res: Response) => {
    res.json(await habitService.complete(req.params.id, req.user!.id, req.body));
  },
  remove: async (req: Request, res: Response) => {
    await habitService.remove(req.params.id, req.user!.id);
    res.json({ ok: true });
  }
};
