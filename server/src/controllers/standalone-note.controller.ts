import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';

export const MAX_NOTE_TITLE_LENGTH = 160;
export const MAX_NOTE_HTML_LENGTH = 120_000;
const NOTE_LIST_LIMIT = 500;

type NotePayload = { title?: string; content?: string; groupId?: string | null };

export function validateStandaloneNotePayload(body: unknown, allowPartial: boolean): NotePayload {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new NoteInputError('Некорректные данные заметки.');
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some(key => !['title', 'content', 'groupId'].includes(key))) {
    throw new NoteInputError('Неизвестное поле заметки.');
  }
  if (allowPartial && !Object.prototype.hasOwnProperty.call(record, 'title') && !Object.prototype.hasOwnProperty.call(record, 'content') && !Object.prototype.hasOwnProperty.call(record, 'groupId')) {
    throw new NoteInputError('Нет данных для изменения.');
  }
  const data: NotePayload = {};
  if (Object.prototype.hasOwnProperty.call(record, 'title')) {
    if (typeof record.title !== 'string' || record.title.length > MAX_NOTE_TITLE_LENGTH) {
      throw new NoteInputError('Название заметки должно быть не длиннее 160 символов.');
    }
    data.title = record.title.trim();
  }
  if (Object.prototype.hasOwnProperty.call(record, 'content')) {
    if (typeof record.content !== 'string' || record.content.length > MAX_NOTE_HTML_LENGTH) {
      throw new NoteInputError('Содержимое заметки слишком длинное.');
    }
    data.content = record.content;
  }
  if (Object.prototype.hasOwnProperty.call(record, 'groupId')) {
    if (record.groupId !== null && (typeof record.groupId !== 'string' || !record.groupId.trim() || record.groupId.length > 128)) {
      throw new NoteInputError('Некорректный идентификатор группы.');
    }
    data.groupId = record.groupId === null ? null : record.groupId as string;
  }
  return data;
}

async function verifyGroupAccess(userId: string, groupId: string | null | undefined) {
  if (!groupId) return;
  const group = await prisma.standaloneNoteGroup.findFirst({
    where: { id: groupId, userId }, select: { id: true }
  });
  if (!group) throw new NoteInputError('Группа не найдена или недоступна.');
}

export class NoteInputError extends Error {}

export const standaloneNoteController = {
  list: async (req: Request, res: Response) => {
    const notes = await prisma.standaloneNote.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: NOTE_LIST_LIMIT,
      select: { id: true, title: true, content: true, groupId: true, createdAt: true, updatedAt: true }
    });
    res.json(notes);
  },

  create: async (req: Request, res: Response) => {
    const data = validateStandaloneNotePayload(req.body ?? {}, false);
    await verifyGroupAccess(req.user!.id, data.groupId);
    const note = await prisma.standaloneNote.create({
      data: { userId: req.user!.id, title: data.title ?? '', content: data.content ?? '', groupId: data.groupId ?? null },
      select: { id: true, title: true, content: true, groupId: true, createdAt: true, updatedAt: true }
    });
    res.status(201).json(note);
  },

  update: async (req: Request, res: Response) => {
    const data = validateStandaloneNotePayload(req.body, true);
    await verifyGroupAccess(req.user!.id, data.groupId);
    const result = await prisma.standaloneNote.updateMany({
      where: { id: req.params.id, userId: req.user!.id }, data
    });
    if (result.count === 0) {
      res.status(404).json({ error: 'Заметка не найдена.' });
      return;
    }
    const note = await prisma.standaloneNote.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user!.id },
      select: { id: true, title: true, content: true, groupId: true, createdAt: true, updatedAt: true }
    });
    res.json(note);
  },

  remove: async (req: Request, res: Response) => {
    const result = await prisma.standaloneNote.deleteMany({
      where: { id: req.params.id, userId: req.user!.id }
    });
    if (result.count === 0) {
      res.status(404).json({ error: 'Заметка не найдена.' });
      return;
    }
    res.json({ ok: true });
  }
};

export function sendNoteInputError(error: unknown, res: Response): boolean {
  if (!(error instanceof NoteInputError)) return false;
  res.status(400).json({ error: error.message });
  return true;
}
