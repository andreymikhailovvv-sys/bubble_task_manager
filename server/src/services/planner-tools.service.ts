import { prisma } from '../db/prisma.js';

export const PLANNER_OPERATIONS = [
  'create_task', 'create_event', 'create_subtask', 'rename', 'set_description',
  'reschedule', 'clear_due_date', 'complete', 'reopen', 'delete', 'set_priority',
  'set_notification', 'change_sphere'
] as const;

export type PlannerOperation = typeof PLANNER_OPERATIONS[number];
export type PlannerSearchInput = {
  queries: string[];
  keywords: string[];
  sphereHints: string[];
  itemType: 'any' | 'task' | 'subtask';
  statusScope: 'active' | 'completed' | 'all';
  dueFrom: string | null;
  dueTo: string | null;
  limit: number;
};
export type PlannerCandidate = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: Date | null;
  taskType: string;
  parentTaskId: string | null;
  updatedAt: Date;
  sphere: { id: string; name: string } | null;
  parentTask: { id: string; title: string; sphere?: { id: string; name: string } | null } | null;
};
export type PlannerActionInput = {
  operation: PlannerOperation;
  itemId: string | null;
  parentTaskId: string | null;
  title: string | null;
  description: string | null;
  dueDate: string | null;
  importance: number | null;
  urgency: number | null;
  notifyBeforeMinutes: number | null;
  sphereId: string | null;
  location: string | null;
};
export type PlannerUndoOperation = { taskId: string; previous: { dueDate: string | null; status: 'TODO' | 'IN_PROGRESS' | 'DONE' } };

export const normalizePlannerSearchText = (value: string) => value
  .toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

const uniqueTerms = (values: string[], maximum: number) => Array.from(new Set(values.map(normalizePlannerSearchText).filter(Boolean))).slice(0, maximum);
const trigrams = (value: string) => {
  const normalized = `  ${normalizePlannerSearchText(value)} `;
  const result = new Set<string>();
  for (let index = 0; index <= normalized.length - 3; index += 1) result.add(normalized.slice(index, index + 3));
  return result;
};
export const plannerStringSimilarity = (left: string, right: string) => {
  const a = trigrams(left); const b = trigrams(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return (2 * intersection) / (a.size + b.size);
};

const textMatchesTerm = (text: string, term: string) => text.includes(term) || text.split(' ').some((word) => plannerStringSimilarity(word, term) >= 0.58);

export function rankPlannerSearchCandidates(candidates: PlannerCandidate[], input: Pick<PlannerSearchInput, 'queries' | 'keywords' | 'sphereHints'>) {
  const queries = uniqueTerms(input.queries, 4);
  const keywords = uniqueTerms(input.keywords, 10);
  const sphereHints = uniqueTerms(input.sphereHints, 6);
  return candidates.map((candidate) => {
    const title = normalizePlannerSearchText(candidate.title);
    const parent = normalizePlannerSearchText(candidate.parentTask?.title ?? '');
    const sphere = normalizePlannerSearchText(candidate.sphere?.name ?? candidate.parentTask?.sphere?.name ?? '');
    const description = normalizePlannerSearchText(candidate.description ?? '');
    let score = 0;
    for (const query of queries) {
      if (title === query) score += 65;
      else if (title.includes(query) || query.includes(title)) score += 38;
      if (parent.includes(query)) score += 27;
      if (sphere.includes(query)) score += 13;
      if (description.includes(query)) score += 9;
      score += plannerStringSimilarity(title, query) * 25;
      score += plannerStringSimilarity(parent, query) * 12;
    }
    const matchedTerms = keywords.filter((keyword) => {
      if (textMatchesTerm(title, keyword)) { score += 14; return true; }
      if (textMatchesTerm(parent, keyword)) { score += 10; return true; }
      if (textMatchesTerm(sphere, keyword)) { score += 6; return true; }
      if (textMatchesTerm(description, keyword)) { score += 4; return true; }
      const similarity = Math.max(plannerStringSimilarity(title, keyword), plannerStringSimilarity(parent, keyword));
      if (similarity >= 0.45) { score += 5 * similarity; return true; }
      return false;
    });
    if (matchedTerms.length > 1) score += matchedTerms.length * matchedTerms.length * 10;
    if (keywords.length) score += (matchedTerms.length / keywords.length) * 22;
    if (sphereHints.some((hint) => sphere.includes(hint) || plannerStringSimilarity(sphere, hint) >= 0.6)) score += 12;
    return { candidate, score: Math.round(score), matchedTerms };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || b.candidate.updatedAt.getTime() - a.candidate.updatedAt.getTime());
}

const errorResult = (code: string, message: string) => ({ ok: false as const, code, message });
const validIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(new Date(value).getTime());

export function validatePlannerActionResolution(action: PlannerActionInput, resolvedItemIds: Set<string>, resolvedSphereIds: Set<string>) {
  if (!PLANNER_OPERATIONS.includes(action.operation)) return errorResult('INVALID_OPERATION', 'Неизвестная операция planner_action.');
  if (action.operation === 'create_subtask' && (!action.parentTaskId || !resolvedItemIds.has(action.parentTaskId))) return errorResult('ITEM_NOT_RESOLVED', 'Сначала найдите родительскую задачу через search_planner_items.');
  if (!['create_task', 'create_event', 'create_subtask'].includes(action.operation) && (!action.itemId || !resolvedItemIds.has(action.itemId))) return errorResult('ITEM_NOT_RESOLVED', 'Сначала найдите объект через search_planner_items.');
  if (action.operation === 'change_sphere' && action.sphereId !== null && !resolvedSphereIds.has(action.sphereId)) return errorResult('SPHERE_NOT_RESOLVED', 'Сначала получите сектор через list_planner_spheres.');
  if (action.dueDate !== null && !validIsoDate(action.dueDate)) return errorResult('INVALID_DUE_DATE', 'dueDate должен быть корректной датой ISO-8601.');
  if (action.operation === 'reschedule' && action.dueDate === null) return errorResult('DUE_DATE_REQUIRED', 'Для переноса необходимо указать dueDate.');
  if (['create_task', 'create_event', 'create_subtask', 'rename'].includes(action.operation) && !action.title?.trim()) return errorResult('TITLE_REQUIRED', 'Название не может быть пустым.');
  if (action.notifyBeforeMinutes !== null && (!Number.isFinite(action.notifyBeforeMinutes) || action.notifyBeforeMinutes < 0)) return errorResult('INVALID_NOTIFICATION', 'notifyBeforeMinutes должен быть неотрицательным.');
  return null;
}

export function createPlannerToolsService(db: any = prisma) {
  const search = async (userId: string, input: PlannerSearchInput) => {
    const dueFrom = input.dueFrom && validIsoDate(input.dueFrom) ? new Date(input.dueFrom) : undefined;
    const dueTo = input.dueTo && validIsoDate(input.dueTo) ? new Date(input.dueTo) : undefined;
    const candidates: PlannerCandidate[] = await db.task.findMany({
      where: {
        userId,
        ...(input.itemType === 'task' ? { parentTaskId: null } : input.itemType === 'subtask' ? { parentTaskId: { not: null } } : {}),
        ...(input.statusScope === 'active' ? { status: { not: 'DONE' } } : input.statusScope === 'completed' ? { status: 'DONE' } : {}),
        ...(dueFrom || dueTo ? { dueDate: { ...(dueFrom ? { gte: dueFrom } : {}), ...(dueTo ? { lte: dueTo } : {}) } } : {})
      },
      select: { id: true, title: true, description: true, status: true, dueDate: true, taskType: true, parentTaskId: true, updatedAt: true, sphere: { select: { id: true, name: true } }, parentTask: { select: { id: true, title: true, sphere: { select: { id: true, name: true } } } } }
    });
    const ranked = rankPlannerSearchCandidates(candidates, input);
    const limit = Math.max(1, Math.min(10, Math.round(input.limit || 8)));
    const selected = ranked.slice(0, limit);
    const [first, second] = selected;
    const ambiguous = Boolean(first && second && second.score >= 20 && (first.score - second.score <= Math.max(8, first.score * 0.12)));
    return {
      totalCandidates: ranked.length,
      ambiguous,
      results: selected.map(({ candidate, score, matchedTerms }) => ({
        id: candidate.id, kind: candidate.parentTaskId ? 'subtask' : 'task', title: candidate.title,
        descriptionPreview: (candidate.description ?? '').slice(0, 250), status: candidate.status,
        dueDate: candidate.dueDate?.toISOString() ?? null, taskType: candidate.taskType,
        sphere: candidate.sphere ?? candidate.parentTask?.sphere ?? null,
        parentTask: candidate.parentTask ? { id: candidate.parentTask.id, title: candidate.parentTask.title } : null,
        score, matchedTerms
      }))
    };
  };

  const getItem = async (userId: string, id: string) => db.task.findFirst({
    where: { id, userId },
    select: { id: true, title: true, description: true, status: true, dueDate: true, taskType: true, parentTaskId: true, importance: true, urgency: true, notifyBeforeMinutes: true, location: true, sphere: { select: { id: true, name: true } }, parentTask: { select: { id: true, title: true, sphere: { select: { id: true, name: true } } } }, subtasks: { select: { id: true, title: true, description: true, status: true, dueDate: true }, orderBy: { createdAt: 'asc' } } }
  });
  const listSpheres = async (userId: string) => db.sphere.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } });

  const action = async (userId: string, value: PlannerActionInput, resolvedItemIds: Set<string>, resolvedSphereIds: Set<string>, userTimeZone: string) => {
    const invalid = validatePlannerActionResolution(value, resolvedItemIds, resolvedSphereIds);
    if (invalid) return invalid;
    const createOperation = ['create_task', 'create_event', 'create_subtask'].includes(value.operation);
    let item: any = null;
    if (!createOperation) {
      item = await db.task.findFirst({ where: { id: value.itemId!, userId }, select: { id: true, title: true, dueDate: true, status: true, parentTaskId: true, importance: true, urgency: true } });
      if (!item) return errorResult('ITEM_NOT_FOUND', 'Объект не найден или принадлежит другому пользователю.');
      if (item.parentTaskId && ['set_priority', 'set_notification', 'change_sphere'].includes(value.operation)) return errorResult('SUBTASK_OPERATION_NOT_ALLOWED', 'Эта операция недоступна для подзадачи.');
    }
    if (value.operation === 'create_subtask') {
      const parent = await db.task.findFirst({ where: { id: value.parentTaskId!, userId, parentTaskId: null }, select: { id: true, title: true } });
      if (!parent) return errorResult('PARENT_NOT_FOUND', 'Родительская задача не найдена.');
      item = await db.task.create({ data: { userId, parentTaskId: parent.id, title: (value.title ?? '').trim().slice(0, 180), description: (value.description ?? '').slice(0, 2000), dueDate: value.dueDate ? new Date(value.dueDate) : null, importance: 3, urgency: 3, priorityScore: 3, status: 'TODO', sphereId: null, notifyBeforeMinutes: 0 } });
      return { ok: true, operation: value.operation, itemId: item.id, report: `Добавлена подзадача «${item.title}» к задаче «${parent.title}».` };
    }
    if (value.operation === 'create_task' || value.operation === 'create_event') {
      if (value.sphereId && !resolvedSphereIds.has(value.sphereId)) return errorResult('SPHERE_NOT_RESOLVED', 'Сначала получите сектор через list_planner_spheres.');
      const importance = Math.max(1, Math.min(5, Math.round(value.importance ?? 3))); const urgency = Math.max(1, Math.min(5, Math.round(value.urgency ?? 3)));
      item = await db.task.create({ data: { userId, title: (value.title ?? '').trim().slice(0, 180), description: (value.description ?? '').slice(0, 4000), dueDate: value.dueDate ? new Date(value.dueDate) : null, taskType: value.operation === 'create_event' ? 'EVENT' : 'TASK', location: value.location?.slice(0, 500) ?? null, importance, urgency, priorityScore: Number((importance * .6 + urgency * .4).toFixed(2)), status: 'TODO', sphereId: value.sphereId, notifyBeforeMinutes: Math.round(value.notifyBeforeMinutes ?? 0) } });
      return { ok: true, operation: value.operation, itemId: item.id, report: `Создан${value.operation === 'create_event' ? 'о событие' : 'а задача'} «${item.title}».` };
    }
    const undoOperation: PlannerUndoOperation | undefined = ['reschedule', 'clear_due_date', 'complete', 'reopen'].includes(value.operation) ? { taskId: item.id, previous: { dueDate: item.dueDate?.toISOString() ?? null, status: item.status } } : undefined;
    const data: Record<string, unknown> = {};
    if (value.operation === 'rename') data.title = (value.title ?? '').trim().slice(0, 180);
    if (value.operation === 'set_description') data.description = (value.description ?? '').slice(0, item.parentTaskId ? 2000 : 4000);
    if (value.operation === 'reschedule') data.dueDate = new Date(value.dueDate!);
    if (value.operation === 'clear_due_date') data.dueDate = null;
    if (value.operation === 'complete') data.status = 'DONE';
    if (value.operation === 'reopen') data.status = 'TODO';
    if (value.operation === 'set_priority') { const importance = Math.max(1, Math.min(5, Math.round(value.importance ?? item.importance))); const urgency = Math.max(1, Math.min(5, Math.round(value.urgency ?? item.urgency))); Object.assign(data, { importance, urgency, priorityScore: Number((importance * .6 + urgency * .4).toFixed(2)) }); }
    if (value.operation === 'set_notification') data.notifyBeforeMinutes = Math.round(value.notifyBeforeMinutes ?? 0);
    if (value.operation === 'change_sphere') data.sphereId = value.sphereId;
    if (value.operation === 'delete') await db.task.deleteMany({ where: { id: item.id, userId } }); else await db.task.updateMany({ where: { id: item.id, userId }, data });
    const labels: Record<string, string> = { rename: `Переименован объект «${item.title}».`, set_description: `Обновлено описание «${item.title}».`, reschedule: `Перенесён объект «${item.title}» на ${new Date(value.dueDate!).toLocaleString('ru-RU', { timeZone: userTimeZone })}.`, clear_due_date: `Срок объекта «${item.title}» очищен.`, complete: `Объект «${item.title}» отмечен выполненным.`, reopen: `Объект «${item.title}» снова открыт.`, delete: `Удалён объект «${item.title}».`, set_priority: `Обновлён приоритет «${item.title}».`, set_notification: `Обновлено уведомление «${item.title}».`, change_sphere: `Изменён сектор «${item.title}».` };
    return { ok: true, operation: value.operation, itemId: item.id, report: labels[value.operation], ...(undoOperation ? { undoOperation } : {}) };
  };
  return { search, getItem, listSpheres, action };
}

export const plannerToolsService = createPlannerToolsService();
