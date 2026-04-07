import { Request, Response } from 'express';
import { taskService } from '../services/task.service.js';

export const taskController = {
  list: async (_: Request, res: Response) => {
    const data = await taskService.list();
    res.json(data);
  },
  create: async (req: Request, res: Response) => {
    const item = await taskService.create(req.body);
    res.status(201).json(item);
  },
  update: async (req: Request, res: Response) => {
    const item = await taskService.update(req.params.id, req.body);
    res.json(item);
  },
  remove: async (req: Request, res: Response) => {
    await taskService.remove(req.params.id);
    res.json({ ok: true });
  }
};
