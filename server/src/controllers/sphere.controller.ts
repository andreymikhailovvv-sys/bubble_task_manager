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
  remove: async (req: Request, res: Response) => {
    await sphereService.remove(req.params.id);
    res.json({ ok: true });
  }
};
