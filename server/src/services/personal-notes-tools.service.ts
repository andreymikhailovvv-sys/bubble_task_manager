import { prisma } from '../db/prisma.js';
import { normalizePlannerSearchText, plannerStringSimilarity } from './planner-tools.service.js';

export type PersonalNoteSearchInput = { queries: string[]; keywords: string[]; limit: number };
type NoteRecord = {
  id: string; title: string; content: string; updatedAt: Date; group: { name: string } | null;
};
export type NoteSearchHit = {
  id: string; kind: 'note'; title: string; group: string | null;
  contentPreview: string; score: number; matchedTerms: string[]; updatedAt: string;
};

/** Convert HTML from NotesEditor to bounded untrusted plain text for search and AI reading. */
export function noteHtmlToSearchText(html: string): string {
  const raw = html
    .replace(/<(script|style|iframe|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/ul|\/ol)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return raw.replace(/&#(x[\da-f]+|\d+);/gi, (match, value: string) => {
    const n = value.startsWith('x') || value.startsWith('X')
      ? parseInt(value.slice(1), 16) : parseInt(value, 10);
    return Number.isFinite(n) && n >= 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
      ? String.fromCodePoint(n) : match;
  }).replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, entity: string) =>
    ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
      as Record<string,string>)[entity.toLowerCase()] ?? ' ')
    .replace(/[\t\r ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

const uniqueSearchWords = (values: unknown, max: number) =>
  Array.isArray(values) ? [...new Set(values.filter((x): x is string => typeof x === 'string')
    .map(x => normalizePlannerSearchText(x).slice(0, 160)).filter(Boolean))].slice(0, max) : [];

export function validateNoteSearchInput(input: unknown): PersonalNoteSearchInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Некорректные параметры поиска заметок.');
  const record = input as Record<string,unknown>;
  const queries = uniqueSearchWords(record.queries, 4);
  const keywords = uniqueSearchWords(record.keywords, 10);
  const limit = typeof record.limit === 'number' && Number.isFinite(record.limit)
    ? Math.max(1, Math.min(10, Math.floor(record.limit))) : 8;
  if (!queries.length && !keywords.length) throw new TypeError('Укажите тему или слова для поиска.');
  return { queries, keywords, limit };
}

const contains = (haystack: string, needle: string) =>
  haystack.includes(needle) || haystack.split(' ').some(word => plannerStringSimilarity(word, needle) >= 0.63);

export function rankPersonalNotes(records: NoteRecord[], input: PersonalNoteSearchInput): NoteSearchHit[] {
  return records.map(note => {
    const text = noteHtmlToSearchText(note.content);
    const normalizedText = normalizePlannerSearchText(text);
    const title = normalizePlannerSearchText(note.title);
    const group = normalizePlannerSearchText(note.group?.name ?? '');
    let score = 0;
    const matchedTerms: string[] = [];
    for (const query of input.queries) {
      if (title && title === query) score += 65;
      else if (title && (title.includes(query) || query.includes(title))) score += 38;
      if (normalizedText.includes(query)) score += 24;
      if (group && group.includes(query)) score += 13;
      if (title) score += Math.round(plannerStringSimilarity(title, query) * 25);
    }
    for (const term of input.keywords) {
      if (contains(title, term)) { score += 18; matchedTerms.push(term); }
      else if (contains(normalizedText, term)) { score += 11; matchedTerms.push(term); }
      else if (contains(group, term)) { score += 6; matchedTerms.push(term); }
    }
    if (matchedTerms.length > 1) score += matchedTerms.length * matchedTerms.length * 10;
    if (input.keywords.length) score += Math.round(22 * matchedTerms.length / input.keywords.length);
    const firstMatch = [...input.queries, ...input.keywords]
      .map(term => normalizedText.indexOf(term)).filter(index => index >= 0).sort((a,b) => a-b)[0];
    const start = firstMatch === undefined ? 0 : Math.max(0, firstMatch - 100);
    const snippet = text.slice(start, start + 380);
    return { id: note.id, kind: 'note' as const, title: note.title || 'Без названия',
      group: note.group?.name ?? null,
      contentPreview: (start ? '…' : '') + snippet + (start + 380 < text.length ? '…' : ''),
      score, matchedTerms, updatedAt: note.updatedAt.toISOString() };
  }).filter(item => item.score > 0)
    .sort((a,b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0,input.limit);
}

export function mergeTaskAndNoteSearchResults(
  tasks: { results: Array<{ id: string; score: number; [key: string]: unknown }>; totalCandidates: number },
  notes: { results: NoteSearchHit[]; totalCandidates: number },
  limit: number
) {
  const results = [
    ...tasks.results.map(task => ({ ...task, kind: task.kind ?? 'task', source: 'tasks' as const })),
    ...notes.results.map(note => ({ ...note, source: 'notes' as const }))
  ].sort((a,b) => b.score - a.score).slice(0, Math.max(1, Math.min(15,limit)));
  return { results, totalCandidates: tasks.totalCandidates + notes.totalCandidates,
    taskCandidateCount: tasks.totalCandidates, noteCandidateCount: notes.totalCandidates,
    taskCount: results.filter(item=>item.source==='tasks').length,
    noteCount: results.filter(item=>item.source==='notes').length };
}

export function createPersonalNotesToolsService(db: any = prisma) {
  const search = async (userId: string, raw: unknown) => {
    const input = validateNoteSearchInput(raw);
    const notes: NoteRecord[] = await db.standaloneNote.findMany({
      where: { userId }, orderBy: { updatedAt: 'desc' }, take: 500,
      select: { id: true, title: true, content: true, updatedAt: true, group: { select: { name: true } } }
    });
    const results = rankPersonalNotes(notes, input);
    return { totalCandidates: notes.length, results, limit: input.limit };
  };
  const read = async (userId: string, id: string) => {
    if (typeof id !== 'string' || !id.trim() || id.length > 128) return null;
    const note: NoteRecord | null = await db.standaloneNote.findFirst({
      where: { id, userId },
      select: { id: true, title: true, content: true, updatedAt: true, group: { select: { name: true } } }
    });
    if (!note) return null;
    const content = noteHtmlToSearchText(note.content);
    return { id: note.id, kind: 'note' as const, title: note.title || 'Без названия',
      group: note.group?.name ?? null, content: content.slice(0, 24000),
      truncated: content.length > 24000, updatedAt: note.updatedAt.toISOString() };
  };
  return { search, read };
}

export const personalNotesToolsService = createPersonalNotesToolsService();
