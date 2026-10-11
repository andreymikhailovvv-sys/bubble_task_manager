import type { Task } from './types';
import type { StandaloneNote } from './api';

export type WorkspaceSearchKind = 'task' | 'subtask' | 'note';
export type WorkspaceSearchHit = {
  id: string;
  kind: WorkspaceSearchKind;
  title: string;
  preview: string;
  context?: string;
  score: number;
};

export const normalizeWorkspaceQuery = (value: string) =>
  value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();

const simplify = (value: string) => normalizeWorkspaceQuery(value).replace(/\s+/g, ' ');
const decodeHtml = (value: string) => value.replace(/&#x([\da-f]+);/gi, (_match, code: string) => {
  const n = parseInt(code, 16);
  return n >= 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
}).replace(/&#(\d+);/g, (_match, code: string) => {
  const n = Number(code);
  return n >= 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
}).replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_match, key: string) =>
  ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '} as Record<string,string>)[key.toLowerCase()] ?? ' ');

/** Indexed text only. The result is always rendered as React text, never HTML. */
export const noteSearchText = (html: string) => decodeHtml(html
  .replace(/<(script|style|iframe|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
  .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/ul|\/ol)\b[^>]*>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')).replace(/\s+/g,' ').trim();

// Small Russian inflection fallback: выставка / выставке, задача / задаче,
// маршрутный / маршрутного. Exact substring matching is always preferred.
const russianStem = (word: string) => word.length < 5 ? word
  : word.replace(/(?:иями|ями|ами|ого|ему|ими|ыми|ый|ий|ой|ая|яя|ое|ее|ые|ие|ых|их|ом|ем|ам|ям|ах|ях|ов|ев|ей|у|ю|е|и|ы|а|я)$/u, '');

function matchIndex(haystack: string, term: string): number {
  const direct = haystack.indexOf(term);
  if (direct >= 0) return direct;
  if (term.length < 5 || !/[а-я]/u.test(term)) return -1;
  const queryStem = russianStem(term);
  if (queryStem.length < 4) return -1;
  for (const word of haystack.matchAll(/[а-яёa-z0-9]+/gu)) {
    if (russianStem(word[0]) === queryStem) return word.index ?? -1;
  }
  return -1;
}

type SearchRow = { id: string; kind: WorkspaceSearchKind; title: string; description: string; context?: string };
export function scoreWorkspaceRow(row: SearchRow, query: string): WorkspaceSearchHit | null {
  const terms = simplify(query).split(' ').filter(Boolean).slice(0, 10);
  if (!terms.length) return null;
  const title = simplify(row.title);
  const body = simplify(row.description);
  const context = simplify(row.context ?? '');
  if (!terms.every(term => matchIndex(title, term) >= 0 || matchIndex(body, term) >= 0 || matchIndex(context, term) >= 0)) return null;
  const fullQuery = terms.join(' ');
  const score = (title === fullQuery ? 200 : title.includes(fullQuery) ? 110 : 0)
    + (body.includes(fullQuery) ? 45 : 0)
    + terms.reduce((n, term) => n + (matchIndex(title, term) >= 0 ? 35 : matchIndex(body, term) >= 0 ? 12 : 5), 0);
  const firstFound = terms.map(term => matchIndex(body, term)).filter(idx => idx >= 0).sort((a,b)=>a-b)[0];
  const start = firstFound === undefined ? 0 : Math.max(0, firstFound - 55);
  return {
    id: row.id, kind: row.kind, title: row.title || 'Без названия', context: row.context,
    preview: (start ? '…' : '') + row.description.slice(start, start + 190)
      + (start + 190 < row.description.length ? '…' : ''),
    score
  };
}

export function searchWorkspace(
  tasks: Task[],
  subtasks: Task[],
  notes: StandaloneNote[],
  query: string,
  limitPerKind = 5
): Record<WorkspaceSearchKind, WorkspaceSearchHit[]> {
  const empty = { task: [] as WorkspaceSearchHit[], subtask: [] as WorkspaceSearchHit[], note: [] as WorkspaceSearchHit[] };
  if (!simplify(query)) return empty;
  const parentNames = new Map(tasks.map(task => [task.id, task.title]));
  const search = (rows: SearchRow[]) => rows
    .map(row => scoreWorkspaceRow(row, query))
    .filter((row): row is WorkspaceSearchHit => row !== null)
    .sort((a,b) => b.score - a.score || a.title.localeCompare(b.title, 'ru'))
    .slice(0, limitPerKind);
  return {
    task: search(tasks.filter(task => !task.parentTaskId).map(task => ({
      id: task.id, kind: 'task' as const, title: task.title, description: task.description ?? ''
    }))),
    subtask: search(subtasks.map(task => ({
      id: task.id, kind: 'subtask' as const, title: task.title, description: task.description ?? '',
      context: task.parentTaskId ? parentNames.get(task.parentTaskId) ?? '' : ''
    }))),
    note: search(notes.map(note => ({
      id: note.id, kind: 'note' as const, title: note.title || 'Без названия',
      description: noteSearchText(note.content)
    })))
  };
}
