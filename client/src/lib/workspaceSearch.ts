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
export type WorkspaceSearchResults = Record<WorkspaceSearchKind, WorkspaceSearchHit[]> & { closed: WorkspaceSearchHit[] };

export const normalizeWorkspaceQuery = (value: string) =>
  value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();

const simplify = (value: string) => normalizeWorkspaceQuery(value).replace(/\s+/g, ' ');

// The same physical key sequence on the English and Russian keyboard.
// Convert query tokens, never indexed documents: existing English names remain
// searchable normally, even if a mapped Russian token happens to match too.
const EN_LAYOUT = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
const RU_LAYOUT = "йцукенгшщзхъфывапролджэячсмитьбю";
const EN_TO_RU = new Map([...EN_LAYOUT].map((key, index) => [key, RU_LAYOUT[index]]));
const RU_TO_EN = new Map([...RU_LAYOUT].map((key, index) => [key, EN_LAYOUT[index]]));

export function workspaceQueryVariants(query: string): string[] {
  const normalized = simplify(query);
  if (!normalized) return [];
  const map = /[a-z]/u.test(normalized) && !/[а-я]/u.test(normalized) ? EN_TO_RU
    : /[а-я]/u.test(normalized) && !/[a-z]/u.test(normalized) ? RU_TO_EN : null;
  const mapped = map ? [...normalized].map(char => map.get(char) ?? char).join('') : normalized;
  return mapped !== normalized ? [normalized, mapped] : [normalized];
}

const termVariants = (term: string): string[] => workspaceQueryVariants(term);
export function matchesWorkspaceText(text: string, query: string): boolean {
  const source = simplify(text);
  const terms = simplify(query).split(' ').filter(Boolean).slice(0, 10);
  return terms.length > 0 && terms.every(term => termVariants(term).some(variant => source.includes(variant)));
}
const decodeHtml = (value: string) => value.replace(/&#x([\da-f]+);/gi, (_match, code: string) => {
  const n = parseInt(code, 16);
  return n >= 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
}).replace(/&#(\d+);/g, (_match, code: string) => {
  const n = Number(code);
  return n >= 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
}).replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_match, key: string) =>
  ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '} as Record<string,string>)[key.toLowerCase()] ?? ' ');

/** Indexed text only. The result is always rendered as React text, never HTML. */
export const noteSearchText = (html: string) => decodeHtml(decodeHtml(html)
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
  const cleanTitle = noteSearchText(row.title);
  const cleanBody = noteSearchText(row.description);
  const cleanContext = noteSearchText(row.context ?? '');
  const title = simplify(cleanTitle);
  const body = simplify(cleanBody);
  const context = simplify(cleanContext);
  const matched = terms.map(term => {
    const variants = termVariants(term);
    // Prefer an exact-layout match over a converted match.
    const match = variants.map(variant => ({
      titleIndex: matchIndex(title, variant), bodyIndex: matchIndex(body, variant),
      contextIndex: matchIndex(context, variant), variant
    })).find(entry => entry.titleIndex >= 0 || entry.bodyIndex >= 0 || entry.contextIndex >= 0);
    return match ?? null;
  });
  if (matched.some(entry => entry === null)) return null;
  const hitTerms = matched.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const fullQueryVariants = workspaceQueryVariants(query);
  const score = (fullQueryVariants.some(value => title === value) ? 200 :
    fullQueryVariants.some(value => title.includes(value)) ? 110 : 0)
    + (fullQueryVariants.some(value => body.includes(value)) ? 45 : 0)
    + hitTerms.reduce((n, entry) => n + (entry.titleIndex >= 0 ? 35 : entry.bodyIndex >= 0 ? 12 : 5), 0);
  const firstFound = hitTerms.map(entry => entry.bodyIndex).filter(idx => idx >= 0).sort((a,b)=>a-b)[0];
  const start = firstFound === undefined ? 0 : Math.max(0, firstFound - 55);
  return {
    id: row.id, kind: row.kind, title: cleanTitle || 'Без названия', context: cleanContext,
    preview: (start ? '…' : '') + cleanBody.slice(start, start + 190)
      + (start + 190 < cleanBody.length ? '…' : ''),
    score
  };
}

export function searchWorkspace(
  tasks: Task[],
  subtasks: Task[],
  notes: StandaloneNote[],
  query: string,
  limitPerKind = 5
): WorkspaceSearchResults {
  const empty: WorkspaceSearchResults = { task: [], subtask: [], note: [], closed: [] };
  if (!simplify(query)) return empty;
  const parentNames = new Map(tasks.map(task => [task.id, task.title]));
  const search = (rows: SearchRow[]) => rows
    .map(row => scoreWorkspaceRow(row, query))
    .filter((row): row is WorkspaceSearchHit => row !== null)
    .sort((a,b) => b.score - a.score || a.title.localeCompare(b.title, 'ru'))
    .slice(0, limitPerKind);
  const taskRow = (task: Task): SearchRow => ({
    id: task.id, kind: 'task', title: task.title, description: task.description ?? ''
  });
  const subtaskRow = (task: Task): SearchRow => ({
    id: task.id, kind: 'subtask', title: task.title, description: task.description ?? '',
    context: task.parentTaskId ? parentNames.get(task.parentTaskId) ?? '' : ''
  });
  const activeTasks = tasks.filter(task => !task.parentTaskId && task.status !== 'DONE');
  const closedTasks = tasks.filter(task => !task.parentTaskId && task.status === 'DONE');
  const activeSubtasks = subtasks.filter(task => task.status !== 'DONE');
  const closedSubtasks = subtasks.filter(task => task.status === 'DONE');
  return {
    task: search(activeTasks.map(taskRow)),
    subtask: search(activeSubtasks.map(subtaskRow)),
    note: search(notes.map(note => ({
      id: note.id, kind: 'note' as const, title: note.title || 'Без названия',
      description: noteSearchText(note.content)
    }))),
    closed: search([...closedTasks.map(taskRow), ...closedSubtasks.map(subtaskRow)])

  };
}
