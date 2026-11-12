import type { Task } from './types';

const TASK_REF_RE = /\[\[task_ref(?:=([^\]]+)|:([^|\]]+)\|[^\]]+)\]\]/g;
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Add first-party task buttons to factual delegated voice results even when
 * the text model forgets to print a task_ref marker. IDs only come from the
 * authenticated user's real task catalog, never from generated prose.
 */
export function linkVerifiedVoiceTaskMentions(
  answer: string, tasks: ReadonlyArray<Pick<Task, 'id' | 'title'>>
): string {
  if (!answer.trim() || tasks.length === 0) return answer;
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const title = task.title.trim().toLocaleLowerCase('ru');
    if (title) counts.set(title, (counts.get(title) ?? 0) + 1);
  }
  const unique = tasks
    .filter(task => {
      const title = task.title.trim().toLocaleLowerCase('ru');
      return title.length >= 3 && counts.get(title) === 1 && !!task.id;
    })
    .sort((a, b) => b.title.length - a.title.length);
  let linked = 0;
  return answer.split('\n').map(line => {
    if (linked >= 30) return line;
    const existing = new Set<string>();
    for (const match of line.matchAll(TASK_REF_RE)) existing.add(match[1] || match[2]);
    const plain = line.replace(TASK_REF_RE, '');
    const lower = plain.toLocaleLowerCase('ru');
    const isList = /^\s*(?:[-*•]|\d+[.)])\s+/.test(plain);
    const matches: Array<{ start: number; end: number; id: string }> = [];
    for (const task of unique) {
      if (!isList && task.title.trim().length < 9) continue;
      if (existing.has(task.id)) continue;
      const title = task.title.trim().toLocaleLowerCase('ru');
      let cursor = 0;
      while (cursor < lower.length) {
        const at = lower.indexOf(title, cursor);
        if (at < 0) break;
        const end = at + title.length;
        cursor = end;
        if ((at > 0 && WORD_CHAR.test(lower[at - 1])) ||
            (end < lower.length && WORD_CHAR.test(lower[end]))) continue;
        if (matches.some(match => at < match.end && end > match.start)) continue;
        matches.push({ start: at, end, id: task.id });
        break;
      }
      if (matches.length >= 5 || linked + matches.length >= 30) break;
    }
    if (matches.length === 0) return line;
    linked += matches.length;
    return line + ' ' + matches.sort((a, b) => a.start - b.start)
      .map(match => `[[task_ref=${match.id}]]`).join(' ');
  }).join('\n');
}

/** Private UI link metadata must NEVER be narrated by Realtime. */
export function speechSafeVoiceToolAnswer(answer: string): string {
  return answer
    .replace(TASK_REF_RE, '')
    .replace(/(?:task\s*id|id\s*задачи|идентификатор\s*задачи)\s*[:=]\s*[\w-]+/gi, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
