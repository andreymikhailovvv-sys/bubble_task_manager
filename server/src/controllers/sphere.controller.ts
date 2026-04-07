import { Request, Response } from 'express';
import { sphereService } from '../services/sphere.service.js';

export const sphereController = {
  list: async (_: Request, res: Response) => {
    const data = await sphereService.list();
    res.json(data);
  },
  create: async (req: Request, res: Response) => {
    const item = await sphereService.create(req.body);
    res.status(201).json(item);
  },
  update: async (req: Request, res: Response) => {
    const item = await sphereService.update(req.params.id, req.body);
    res.json(item);
  },
  remove: async (req: Request, res: Response) => {
    try {
      await sphereService.remove(req.params.id);
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('MIN_SPHERES:')) {
        res.status(400).json({ error: 'Минимум 3 сектора. Удаление недоступно.' });
        return;
      }
      throw error;
    }
  }
};
