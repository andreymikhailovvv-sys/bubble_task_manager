import { prisma } from '../db/prisma.js';

/** Route explicit commands through the real note tool, including Telegram voice transcripts. */
export function requiresNoteCreation(question: string): boolean {
  const q = question.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
  if (!q || q.length > 12000) return false;
  if (/^(?:как|почему|объясни|расскажи|можно ли|умеешь ли|подскажи как)/.test(q)) return false;
  if (/не\s+(?:создавай|записывай|сохраняй|добавляй)/.test(q)) return false;
  const intent = /(?:создай|создать|добавь|добавить|сделай|оформи)\s+(?:(?:мне|пожалуйста)\s+)?(?:новую\s+)?заметк/.test(q)
    || /(?:запиши|записать|сохрани|сохранить)\s+(?:(?:это|текст|информацию|мне)\s+)?(?:в\s+заметки|как\s+заметку|заметку)/.test(q);
  if (!intent) return false;
  // With no content to save the assistant should ask for details, not write a blank note.
  return q.length >= 32 || /(?:это|следующее|вот что|вот это|из предыдущего)/.test(q);
}

export type CreatePersonalNoteArgs = {
  title: string;
  content: string;
  groupName: string | null;
};

export function validateAiCreateNoteArgs(value: unknown): CreatePersonalNoteArgs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Укажите название и содержание заметки.');
  }
  const data = value as Record<string, unknown>;
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const content = typeof data.content === 'string' ? data.content.trim() : '';
  if (!title && !content) throw new TypeError('Нельзя создать полностью пустую заметку.');
  if (title.length > 160 || content.length > 12000) {
    throw new TypeError('Название или содержание заметки слишком длинное.');
  }
  if (data.groupName !== null && data.groupName !== undefined &&
      (typeof data.groupName !== 'string' || data.groupName.trim().length > 50)) {
    throw new TypeError('Некорректное название группы.');
  }
  return { title: title || 'Без названия', content,
    groupName: typeof data.groupName === 'string' && data.groupName.trim()
      ? data.groupName.trim() : null };
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Create simple safe NotesEditor-compatible HTML. Never store model-provided raw HTML. */
export function aiNoteTextToHtml(text: string) {
  return text.split(/\r?\n/).map(line =>
    '<p>' + (line.trim() ? escapeHtml(line) : '<br>') + '</p>'
  ).join('');
}

export function createAiPersonalNotesService(db: typeof prisma = prisma) {
  return {
    async create(userId: string, raw: unknown) {
      const input = validateAiCreateNoteArgs(raw);
      const group = input.groupName ? await db.standaloneNoteGroup.findFirst({
        where: { userId, name: { equals: input.groupName, mode: 'insensitive' } },
        select: { id: true, name: true }
      }) : null;
      if (input.groupName && !group) {
        return { ok: false as const, code: 'GROUP_NOT_FOUND', message:
          'Группа «' + input.groupName + '» не найдена. Уточните название или создайте заметку без группы.' };
      }
      const created = await db.standaloneNote.create({
        data: { userId, title: input.title, content: aiNoteTextToHtml(input.content), groupId: group?.id ?? null },
        select: { id: true, title: true, groupId: true, createdAt: true }
      });
      return { ok: true as const, note: { ...created, groupName: group?.name ?? null } };
    },
    async update(userId: string, raw: unknown) {
      const input = validateAiUpdateNoteArgs(raw);
      const existing = await db.standaloneNote.findFirst({
        where: { id: input.id, userId },
        select: { id: true, title: true, content: true, groupId: true, updatedAt: true }
      });
      if (!existing) return { ok: false as const, code: 'NOTE_NOT_FOUND', message: 'Заметка не найдена или недоступна.' };
      const group = input.groupName && input.groupName.length
        ? await db.standaloneNoteGroup.findFirst({
          where: { userId, name: { equals: input.groupName, mode: 'insensitive' } },
          select: { id: true, name: true }
        }) : null;
      if (input.groupName && !group) {
        return { ok: false as const, code: 'GROUP_NOT_FOUND', message: 'Указанная группа не найдена.' };
      }
      const changes: { title?: string; content?: string; groupId?: string | null } = {};
      if (input.title !== null) changes.title = input.title;
      if (input.content !== null) {
        const html = aiNoteTextToHtml(input.content);
        changes.content = input.contentMode === 'append' ? existing.content + html : html;
        if (changes.content.length > 120000) {
          return { ok: false as const, code: 'NOTE_TOO_LONG', message: 'Содержимое заметки превышает лимит.' };
        }
      }
      if (input.groupName !== null) changes.groupId = group?.id ?? null;
      // Prevent overwriting another edit performed after this note was read.
      const result = await db.standaloneNote.updateMany({
        where: { id: input.id, userId, updatedAt: existing.updatedAt },
        data: changes
      });
      if (result.count !== 1) {
        return { ok: false as const, code: 'NOTE_CHANGED', message: 'Заметка уже была изменена. Найдите и прочитайте её ещё раз.' };
      }
      const updated = await db.standaloneNote.findFirst({
        where: { id: input.id, userId },
        select: { id: true, title: true, groupId: true, updatedAt: true }
      });
      return { ok: true as const, note: updated, changed: Object.keys(changes) };
    }
  };
}


export type UpdatePersonalNoteArgs = {
  id: string;
  title: string | null;
  content: string | null;
  contentMode: 'replace' | 'append' | null;
  groupName: string | null;
};

/** Null means unchanged; an empty group name explicitly moves to "without group". */
export function validateAiUpdateNoteArgs(raw: unknown): UpdatePersonalNoteArgs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Некорректное изменение заметки.');
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some((key) => !['id', 'title', 'content', 'contentMode', 'groupName'].includes(key))) {
    throw new TypeError('Неизвестное поле для изменения заметки.');
  }
  if (typeof value.id !== 'string' || !value.id.trim() || value.id.length > 128) throw new TypeError('Укажите ID найденной заметки.');
  const title = value.title === null ? null : typeof value.title === 'string' ? value.title.trim() : undefined;
  const content = value.content === null ? null : typeof value.content === 'string' ? value.content : undefined;
  const contentMode = value.contentMode === null ? null : value.contentMode;
  const groupName = value.groupName === null ? null : typeof value.groupName === 'string' ? value.groupName.trim() : undefined;
  if (title === undefined || content === undefined || groupName === undefined ||
      (contentMode !== null && contentMode !== 'replace' && contentMode !== 'append')) {
    throw new TypeError('Некорректные поля изменения заметки.');
  }
  if (title !== null && (!title || title.length > 160)) throw new TypeError('Название заметки должно содержать 1–160 символов.');
  if (content !== null && content.length > 24000) throw new TypeError('Текст заметки слишком длинный.');
  if (groupName !== null && groupName.length > 50) throw new TypeError('Название группы слишком длинное.');
  if ((content === null) !== (contentMode === null)) throw new TypeError('Укажите способ изменения текста: replace или append.');
  if (contentMode === 'append' && !content?.trim()) throw new TypeError('Нет текста для добавления.');
  if (title === null && content === null && groupName === null) throw new TypeError('Нет данных для изменения заметки.');
  return { id: value.id, title, content, contentMode: contentMode as UpdatePersonalNoteArgs['contentMode'], groupName };
}

export const aiPersonalNotesService = createAiPersonalNotesService();
