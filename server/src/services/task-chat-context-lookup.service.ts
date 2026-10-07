import { prisma } from '../db/prisma.js';

export const TASK_CHAT_CONTEXT_MAX_TOOL_CALLS = 3;
export const TASK_CHAT_CONTEXT_MAX_PROVIDER_CALLS = TASK_CHAT_CONTEXT_MAX_TOOL_CALLS + 1;
export const TASK_CHAT_STORED_FILE_FETCH_LIMIT = 2;

export type TaskContextLookupArguments = {
  operation: 'search_subtasks' | 'list_subtasks' | 'get_subtask' | 'list_attachments' | 'get_attachment';
  query?: string;
  status?: 'active' | 'done' | 'all';
  offset?: number | null;
  limit?: number | null;
  subtaskId?: string;
  attachmentId?: string;
};

export const TASK_CONTEXT_LOOKUP_TOOL = {
  type: 'function',
  name: 'task_context_lookup',
  description: 'Read-only lookup for subtasks and stored files belonging to the current task. Use search_subtasks for a targeted search for a few matching subtasks. Use list_subtasks to retrieve the complete subtask set when analysing, grouping, sorting, comparing, or prioritising the whole list; follow pagination until hasMore is false.',
  strict: true,
  parameters: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['search_subtasks', 'list_subtasks', 'get_subtask', 'list_attachments', 'get_attachment'] },
      query: { type: ['string', 'null'] },
      status: { type: ['string', 'null'], enum: ['active', 'done', 'all', null] },
      offset: { type: ['integer', 'null'] },
      limit: { type: ['integer', 'null'] },
      subtaskId: { type: ['string', 'null'] },
      attachmentId: { type: ['string', 'null'] }
    },
    required: ['operation', 'query', 'status', 'offset', 'limit', 'subtaskId', 'attachmentId'],
    additionalProperties: false
  }
} as const;

const words = (value: string) => value.toLocaleLowerCase('ru-RU').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export async function executeTaskContextLookup(input: {
  userId: string;
  taskId: string;
  isSubtaskChat: boolean;
  args: TaskContextLookupArguments;
}) {
  const { args } = input;
  if (args.operation === 'search_subtasks') {
    const status = args.status ?? 'active';
    const candidates = await prisma.task.findMany({
      where: { parentTaskId: input.taskId, ...(status === 'active' ? { status: { not: 'DONE' } } : status === 'done' ? { status: 'DONE' } : {}) },
      select: { id: true, title: true, description: true, status: true, dueDate: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    });
    const tokens = words(args.query ?? '');
    const ranked = candidates.map((item, index) => {
      const title = item.title.toLocaleLowerCase('ru-RU');
      const description = (item.description ?? '').toLocaleLowerCase('ru-RU');
      const score = tokens.length === 0 ? 1 : tokens.reduce((sum, token) => sum + (title.includes(token) ? 3 : 0) + (description.includes(token) ? 1 : 0), 0);
      return { item, index, score };
    }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
    return { result: { ok: true, totalMatches: ranked.length, results: ranked.slice(0, 10).map(({ item }) => ({ id: item.id, title: item.title, status: item.status, dueDate: item.dueDate })) } };
  }
  if (args.operation === 'list_subtasks') {
    const status = args.status ?? 'active';
    const offset = Number.isInteger(args.offset) && Number(args.offset) >= 0 ? Number(args.offset) : 0;
    const requestedLimit = Number.isInteger(args.limit) && Number(args.limit) > 0 ? Number(args.limit) : 100;
    const limit = Math.min(requestedLimit, 100);
    const where = { parentTaskId: input.taskId, ...(status === 'active' ? { status: { not: 'DONE' as const } } : status === 'done' ? { status: 'DONE' as const } : {}) };
    const [total, subtasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        select: { id: true, title: true, description: true, status: true, dueDate: true },
        orderBy: { createdAt: 'asc' },
        skip: offset,
        take: limit
      })
    ]);
    const count = subtasks.length;
    const hasMore = offset + count < total;
    return {
      result: {
        ok: true,
        total,
        offset,
        count,
        hasMore,
        nextOffset: hasMore ? offset + count : null,
        subtasks: subtasks.map(({ description, ...subtask }) => ({
          ...subtask,
          descriptionPreview: description ? description.slice(0, 500) : null
        }))
      }
    };
  }
  if (args.operation === 'get_subtask') {
    if (!args.subtaskId) return { result: { ok: false, code: 'INVALID_ARGUMENTS' } };
    const subtask = await prisma.task.findFirst({ where: { id: args.subtaskId, parentTaskId: input.taskId }, select: { id: true, title: true, description: true, status: true, dueDate: true } });
    return { result: subtask ? { ok: true, subtask } : { ok: false, code: 'NOT_FOUND' } };
  }
  if (args.operation === 'list_attachments') {
    if (input.isSubtaskChat) return { result: { ok: false, code: 'NOT_AVAILABLE' } };
    const attachments = await prisma.taskAttachment.findMany({ where: { userId: input.userId, taskId: input.taskId }, select: { id: true, name: true, mimeType: true, size: true }, orderBy: { createdAt: 'asc' }, take: 20 });
    const total = await prisma.taskAttachment.count({ where: { userId: input.userId, taskId: input.taskId } });
    return { result: { ok: true, total, attachments } };
  }
  if (!args.attachmentId) return { result: { ok: false, code: 'INVALID_ARGUMENTS' } };
  if (input.isSubtaskChat) return { result: { ok: false, code: 'NOT_AVAILABLE' } };
  const attachment = await prisma.taskAttachment.findFirst({ where: { id: args.attachmentId, userId: input.userId, taskId: input.taskId }, select: { id: true, name: true, mimeType: true, size: true, contentBase64: true } });
  return attachment
    ? { result: { ok: true, attachment: { id: attachment.id, name: attachment.name, mimeType: attachment.mimeType, size: attachment.size } }, attachment }
    : { result: { ok: false, code: 'NOT_FOUND' } };
}
