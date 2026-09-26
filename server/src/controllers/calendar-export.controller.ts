import { type Request, type Response } from 'express';
import { prisma } from '../db/prisma.js';
import {
  createTaskIcs,
  parseCalendarExportOptions,
  signCalendarExportToken,
  verifyCalendarExportToken,
  type CalendarTask
} from '../services/calendar-export.service.js';

type TaskRepository = {
  findFirst(args: {
    where: { id: string; userId: string };
    select: { id: true; userId: true; title: true; description: true; location: true };
  }): Promise<CalendarTask | null>;
};

const taskSelect = { id: true, userId: true, title: true, description: true, location: true } as const;

const publicAppUrl = (req: Request) => {
  const configured = process.env.PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  return (configured || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
};

export const createCalendarExportController = (tasks: TaskRepository = prisma.task) => ({
  createLink: async (req: Request, res: Response) => {
    const options = parseCalendarExportOptions(req.body);
    if (!options) {
      res.status(400).json({ error: 'Некорректные параметры события календаря' });
      return;
    }
    const task = await tasks.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: taskSelect });
    if (!task) {
      res.status(404).json({ error: 'Задача не найдена' });
      return;
    }
    const token = signCalendarExportToken({ taskId: task.id, userId: task.userId, ...options });
    const url = `${publicAppUrl(req)}/api/calendar/ics/export?token=${encodeURIComponent(token)}`;
    res.json({ url });
  },

  exportIcs: async (req: Request, res: Response) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) {
      res.status(401).json({ error: 'Недействительная ссылка экспорта' });
      return;
    }
    let payload;
    try {
      payload = verifyCalendarExportToken(token);
    } catch {
      res.status(401).json({ error: 'Ссылка экспорта недействительна или истекла' });
      return;
    }
    const task = await tasks.findFirst({
      where: { id: payload.taskId, userId: payload.userId },
      select: taskSelect
    });
    if (!task) {
      res.status(404).json({ error: 'Задача не найдена' });
      return;
    }
    const ics = createTaskIcs(task, payload);
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="planirovych-event.ics"',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff'
    });
    res.send(ics);
  }
});

export const calendarExportController = createCalendarExportController();
