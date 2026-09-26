import { randomUUID } from 'node:crypto';
import { openAiFetch } from '../lib/openai-fetch.js';
import { plannerToolsService, type PlannerActionInput, type PlannerSearchInput } from './planner-tools.service.js';

export const MAX_TOOL_ROUNDS = 6;
const nullable = (type: 'string' | 'number') => ({ type: [type, 'null'] });

export const PLANNER_OPENAI_TOOLS = [
  {
    type: 'function', name: 'search_planner_items', strict: true,
    description: 'Найти реальные задачи и подзадачи пользователя. Формируй несколько характерных фраз и контекстных ключевых слов из всего диалога.',
    parameters: { type: 'object', additionalProperties: false, required: ['queries', 'keywords', 'sphereHints', 'itemType', 'statusScope', 'dueFrom', 'dueTo', 'limit'], properties: {
      queries: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' } },
      keywords: { type: 'array', maxItems: 10, items: { type: 'string' } }, sphereHints: { type: 'array', items: { type: 'string' } },
      itemType: { type: 'string', enum: ['any', 'task', 'subtask'] }, statusScope: { type: 'string', enum: ['active', 'completed', 'all'] },
      dueFrom: nullable('string'), dueTo: nullable('string'), limit: { type: 'number', minimum: 1, maximum: 10 }
    } }
  },
  {
    type: 'function', name: 'get_planner_item', strict: true, description: 'Получить безопасные подробности одной ранее найденной задачи или подзадачи.',
    parameters: { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string' } } }
  },
  {
    type: 'function', name: 'list_planner_spheres', strict: true, description: 'Получить сектора пользователя без их инструкций.',
    parameters: { type: 'object', additionalProperties: false, required: [], properties: {} }
  },
  {
    type: 'function', name: 'planner_action', strict: true, description: 'Выполнить одну строго проверяемую операцию над задачами.',
    parameters: { type: 'object', additionalProperties: false, required: ['operation', 'itemId', 'parentTaskId', 'title', 'description', 'dueDate', 'importance', 'urgency', 'notifyBeforeMinutes', 'sphereId', 'location'], properties: {
      operation: { type: 'string', enum: ['create_task', 'create_event', 'create_subtask', 'rename', 'set_description', 'reschedule', 'clear_due_date', 'complete', 'reopen', 'delete', 'set_priority', 'set_notification', 'change_sphere'] },
      itemId: nullable('string'), parentTaskId: nullable('string'), title: nullable('string'), description: nullable('string'), dueDate: nullable('string'),
      importance: nullable('number'), urgency: nullable('number'), notifyBeforeMinutes: nullable('number'), sphereId: nullable('string'), location: nullable('string')
    } }
  }
] as const;

type OpenAiOutputItem = Record<string, unknown>;
type ToolResponse = { output?: OpenAiOutputItem[]; output_text?: string };
type ToolLoopOptions = {
  initialInput: unknown[];
  request: (input: unknown[]) => Promise<ToolResponse>;
  executeTool: (name: string, argumentsValue: unknown, round: number) => Promise<unknown>;
};

const outputText = (response: ToolResponse) => {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text.trim();
  for (const item of response.output ?? []) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') return ((part as { text: string }).text).trim();
  }
  return '';
};

export async function runPlannerToolLoop(options: ToolLoopOptions) {
  const input = [...options.initialInput];
  let rounds = 0;
  while (rounds <= MAX_TOOL_ROUNDS) {
    const response = await options.request(input);
    const output = Array.isArray(response.output) ? response.output : [];
    const calls = output.filter((item) => item.type === 'function_call');
    if (!calls.length) {
      const answer = outputText(response);
      if (!answer) throw new Error('OpenAI returned empty response');
      return { answer, rounds };
    }
    if (rounds === MAX_TOOL_ROUNDS) throw new Error(`Превышен безопасный лимит вызовов planner tools (${MAX_TOOL_ROUNDS}).`);
    rounds += 1;
    input.push(...output);
    for (const call of calls) {
      const callId = typeof call.call_id === 'string' ? call.call_id : '';
      const name = typeof call.name === 'string' ? call.name : '';
      let args: unknown = {};
      try { args = JSON.parse(typeof call.arguments === 'string' ? call.arguments : '{}'); } catch { args = { parseError: true }; }
      const result = await options.executeTool(name, args, rounds);
      input.push({ type: 'function_call_output', call_id: callId, output: JSON.stringify(result) });
    }
  }
  throw new Error('Превышен лимит planner tools.');
}

export async function askAiChatWithPlannerTools(input: { userId: string; model: string; messages: unknown[]; userTimeZone: string; apiKey: string }) {
  const requestId = randomUUID(); const startedAt = Date.now();
  const resolvedItemIds = new Set<string>(); const resolvedSphereIds = new Set<string>();
  const actionReports: string[] = []; const undoOperations: unknown[] = [];
  let usedPlannerTools = false;
  console.info('[AI tools] started', { requestId, userId: input.userId, model: input.model });
  try {
    const loop = await runPlannerToolLoop({
      initialInput: input.messages,
      request: async (requestInput) => {
        const response = await openAiFetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}` }, body: JSON.stringify({ model: input.model, input: requestInput, tools: PLANNER_OPENAI_TOOLS, tool_choice: 'auto', parallel_tool_calls: false }) });
        if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
        return response.json() as Promise<ToolResponse>;
      },
      executeTool: async (name, value, round) => {
        usedPlannerTools = true;
        console.info('[AI tools] tool call', { requestId, tool: name, round });
        if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, code: 'INVALID_ARGUMENTS', message: 'Аргументы tool должны быть объектом.' };
        if (name === 'search_planner_items') {
          const result = await plannerToolsService.search(input.userId, value as PlannerSearchInput);
          result.results.forEach((item) => resolvedItemIds.add(item.id));
          console.info('[AI tools] search complete', { requestId, candidateCount: result.totalCandidates, returnedCount: result.results.length, ambiguous: result.ambiguous });
          return result;
        }
        if (name === 'get_planner_item') {
          const id = (value as { id?: unknown }).id;
          if (typeof id !== 'string') return { ok: false, code: 'INVALID_ID', message: 'id обязателен.' };
          const item = await plannerToolsService.getItem(input.userId, id);
          if (!item) return { ok: false, code: 'ITEM_NOT_FOUND', message: 'Объект не найден.' };
          resolvedItemIds.add(item.id); return { ok: true, item };
        }
        if (name === 'list_planner_spheres') {
          const spheres = await plannerToolsService.listSpheres(input.userId); spheres.forEach((sphere: { id: string }) => resolvedSphereIds.add(sphere.id)); return spheres;
        }
        if (name === 'planner_action') {
          const result = await plannerToolsService.action(input.userId, value as PlannerActionInput, resolvedItemIds, resolvedSphereIds, input.userTimeZone);
          if (result.ok) { actionReports.push(result.report); if ('undoOperation' in result && result.undoOperation) undoOperations.push(result.undoOperation); }
          console.info('[AI tools] action', { requestId, operation: (value as PlannerActionInput).operation, itemId: (value as PlannerActionInput).itemId, ok: result.ok });
          return result;
        }
        return { ok: false, code: 'UNKNOWN_TOOL', message: 'Неизвестный planner tool.' };
      }
    });
    console.info('[AI tools] completed', { requestId, rounds: loop.rounds, usedPlannerTools, actionCount: actionReports.length, durationMs: Date.now() - startedAt });
    return { answer: loop.answer, model: input.model, delegatedToPlanner: usedPlannerTools, actionReports, undoOperations };
  } catch (error) {
    console.info('[AI tools] completed', { requestId, usedPlannerTools, actionCount: actionReports.length, durationMs: Date.now() - startedAt, failed: true });
    throw error;
  }
}
