import type { TaskChatContextMessage } from './task-chat-memory.service.js';

/**
 * Read-only retrieval from the owner-scoped, full task conversation history
 * loaded by the task-chat controller. This works even when the active provider
 * context contains only the recent tail + compacted task memory.
 */
export const TASK_CHAT_HISTORY_LOOKUP_TOOL = {
  type: 'function', name: 'task_history_lookup', strict: true,
  description: 'Поиск по ПОЛНОЙ истории именно текущего чата задачи. Используй перед тем, как повторять уже проделанную работу, просить пользователя повторить ранее сообщённые ограничения, готовые программы или документы, либо утверждать, что чего-то не обсуждали. Ищи характерные слова, затем сверяй ответы и исправления пользователя. Не используй вместо чтения самого файла.',
  parameters: {
    type: 'object', additionalProperties: false, required: ['query', 'limit'],
    properties: { query: { type: 'string', description: 'Ключевые слова, названия и существенные термины из прошлой договорённости' }, limit: { type: 'integer', minimum: 1, maximum: 12 } }
  }
} as const;

type HistoryEntry = Pick<TaskChatContextMessage, 'role' | 'content'> &
  Partial<Pick<TaskChatContextMessage, 'id' | 'createdAt'>>;
const normalize = (value: string) => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
const terms = (value: string) => [...new Set((normalize(value).match(/[\p{L}\p{N}]+/gu) ?? [])
  .filter(word => word.length >= 2)
  .map(word => word.length >= 6 ? word.slice(0, 6) : word.length >= 4 ? word.slice(0, 4) : word))].slice(0, 12);

export function searchTaskChatHistory(history: HistoryEntry[], args: unknown) {
  if (!args || typeof args !== 'object' || Array.isArray(args))
    return { ok: false as const, code: 'INVALID_ARGUMENTS' };
  const { query, limit } = args as { query?: unknown; limit?: unknown };
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 300 ||
      !Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 12)
    return { ok: false as const, code: 'INVALID_ARGUMENTS' };
  const queryTerms = terms(query);
  if (!queryTerms.length) return { ok: false as const, code: 'EMPTY_QUERY' };
  const matches = history.map((message, index) => {
    const content = normalize(message.content);
    const score = queryTerms.reduce((count, term) => count + (content.includes(term) ? 1 : 0), 0);
    return { message, index, score };
  }).filter(result => result.score > 0).sort((a, b) => b.score - a.score || b.index - a.index);
  return {
    ok: true as const, totalMatches: matches.length,
    results: matches.slice(0, limit as number).map(({ message, index }) => ({
      index, role: message.role, createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : null,
      // Do not expose full file blobs or unbounded text through this tool.
      excerpt: message.content.slice(0, 1600), truncated: message.content.length > 1600
    }))
  };
}
