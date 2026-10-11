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
    }
  };
}

export const aiPersonalNotesService = createAiPersonalNotesService();
