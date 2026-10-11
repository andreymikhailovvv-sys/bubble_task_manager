import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { NoteInputError } from './standalone-note.controller.js';

// Eight harmonious accent colors shared by the API and both client themes.
export const NOTE_GROUP_COLORS = [
  '#8b5cf6', // violet
  '#0891b2', // cyan
  '#d97706', // amber
  '#db2777', // rose
  '#059669', // emerald
  '#4f46e5', // indigo
  '#e11d48', // coral
  '#64748b'  // slate
] as const;
export const MAX_NOTE_GROUPS = 40;

export function validateNoteGroupPayload(raw: unknown): { name: string; color: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new NoteInputError('Некорректные данные группы.');
  const data = raw as Record<string, unknown>;
  if (Object.keys(data).some(key => key !== 'name' && key !== 'color')) throw new NoteInputError('Неизвестное поле группы.');
  if (typeof data.name !== 'string') throw new NoteInputError('Укажите название группы.');
  const name = data.name.trim();
  if (!name || name.length > 50) throw new NoteInputError('Название группы должно содержать от 1 до 50 символов.');
  const color = typeof data.color === 'string' ? data.color.toLowerCase() : NOTE_GROUP_COLORS[0];
  if (!(NOTE_GROUP_COLORS as readonly string[]).includes(color)) throw new NoteInputError('Выберите цвет из предложенной палитры.');
  return { name, color };
}
export function sendGroupConflict(error: unknown, res: Response): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    res.status(409).json({ error: 'Группа с таким названием уже существует.' });
    return true;
  }
  return false;
}
const select = { id: true, name: true, color: true, createdAt: true, updatedAt: true } as const;

export const standaloneNoteGroupController = {
  list: async (req: Request, res: Response) => {
    const groups = await prisma.standaloneNoteGroup.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select
    });
    res.json(groups);
  },
  create: async (req: Request, res: Response) => {
    const data = validateNoteGroupPayload(req.body);
    const count = await prisma.standaloneNoteGroup.count({ where: { userId: req.user!.id } });
    if (count >= MAX_NOTE_GROUPS) throw new NoteInputError('Можно создать не более 40 групп.');
    const group = await prisma.standaloneNoteGroup.create({
      data: { ...data, userId: req.user!.id }, select
    });
    res.status(201).json(group);
  },
  update: async (req: Request, res: Response) => {
    const data = validateNoteGroupPayload(req.body);
    const updated = await prisma.standaloneNoteGroup.updateMany({
      where: { id: req.params.id, userId: req.user!.id }, data
    });
    if (!updated.count) {
      res.status(404).json({ error: 'Группа не найдена.' });
      return;
    }
    res.json(await prisma.standaloneNoteGroup.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user!.id }, select
    }));
  },
  remove: async (req: Request, res: Response) => {
    const removed = await prisma.standaloneNoteGroup.deleteMany({
      where: { id: req.params.id, userId: req.user!.id }
    });
    if (!removed.count) {
      res.status(404).json({ error: 'Группа не найдена.' });
      return;
    }
    // onDelete: SetNull leaves notes intact and makes them ungrouped.
    res.json({ ok: true });
  }
};
