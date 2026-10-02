import { openAiFetch } from '../lib/openai-fetch.js';
import { plannerToolsService, type PlannerActionInput, type PlannerSearchInput, type PlannerListInput } from './planner-tools.service.js';
import { recordOpenAiUsageShadow, type OpenAiUsage } from './ai-usage-metering.service.js';
import { refundDynamicResponsesCall, runDynamicResponsesCall, settleDynamicResponsesCall, type DynamicResponsesCall } from './dynamic-responses-billing.service.js';

export const MAX_TOOL_CALLS = 5;
export const MAX_PROVIDER_CALLS = 6;
const nullable = (type: 'string' | 'number') => ({ type: [type, 'null'] });

export const AI_CHAT_OPENAI_TOOLS = [
  {
    type: 'function', name: 'search_tasks', strict: true,
    description: 'Найти реальные задачи и подзадачи пользователя. Формируй несколько характерных фраз и контекстных ключевых слов из всего диалога.',
    parameters: { type: 'object', additionalProperties: false, required: ['queries', 'keywords', 'sphereHints', 'itemType', 'statusScope', 'dueFrom', 'dueTo', 'limit'], properties: {
      queries: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' } },
      keywords: { type: 'array', maxItems: 10, items: { type: 'string' } }, sphereHints: { type: 'array', items: { type: 'string' } },
      itemType: { type: 'string', enum: ['any', 'task', 'subtask'] }, statusScope: { type: 'string', enum: ['active', 'completed', 'all'] },
      dueFrom: nullable('string'), dueTo: nullable('string'), limit: { type: 'number', minimum: 1, maximum: 10 }
    } }
  },
  {
    type: 'function', name: 'list_tasks', strict: true,
    description: 'Получить широкий список реальных задач по фильтрам (например, все задачи за день или неделю). Используй search_tasks вместо этого инструмента для поиска нескольких конкретных задач по смыслу или названию.',
    parameters: { type: 'object', additionalProperties: false, required: ['itemType', 'statusScope', 'dueFrom', 'dueTo', 'sphereId', 'offset', 'limit'], properties: {
      itemType: { type: 'string', enum: ['any', 'task', 'subtask'] }, statusScope: { type: 'string', enum: ['active', 'completed', 'all'] },
      dueFrom: nullable('string'), dueTo: nullable('string'), sphereId: nullable('string'), offset: { type: 'number', minimum: 0 }, limit: { type: 'number', minimum: 1, maximum: 100 }
    } }
  },
  {
    type: 'function', name: 'get_task', strict: true, description: 'Получить безопасные подробности одной ранее найденной задачи или подзадачи.',
    parameters: { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string' } } }
  },
  {
    type: 'function', name: 'list_sectors', strict: true, description: 'Получить сектора пользователя без их инструкций.',
    parameters: { type: 'object', additionalProperties: false, required: [], properties: {} }
  },
  {
    type: 'function', name: 'task_action', strict: true, description: 'Выполнить одну строго проверяемую операцию над задачами.',
    parameters: { type: 'object', additionalProperties: false, required: ['operation', 'itemId', 'parentTaskId', 'title', 'description', 'dueDate', 'importance', 'urgency', 'notifyBeforeMinutes', 'sphereId', 'location'], properties: {
      operation: { type: 'string', enum: ['create_task', 'create_event', 'create_subtask', 'rename', 'set_description', 'reschedule', 'clear_due_date', 'complete', 'reopen', 'delete', 'set_priority', 'set_notification', 'change_sphere'] },
      itemId: nullable('string'), parentTaskId: nullable('string'), title: nullable('string'), description: nullable('string'), dueDate: nullable('string'),
      importance: nullable('number'), urgency: nullable('number'), notifyBeforeMinutes: nullable('number'), sphereId: nullable('string'), location: nullable('string')
    } }
  }
] as const;

type OpenAiOutputItem = Record<string, unknown>;
type ToolResponse = { id?: unknown; usage?: OpenAiUsage; output?: OpenAiOutputItem[]; output_text?: string };
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

export async function runAiChatToolLoop(options: ToolLoopOptions) {
  const input = [...options.initialInput];
  let providerCalls = 0;
  let toolCalls = 0;
  while (providerCalls < MAX_PROVIDER_CALLS) {
    const response = await options.request(input);
    providerCalls += 1;
    const output = Array.isArray(response.output) ? response.output : [];
    const calls = output.filter((item) => item.type === 'function_call');
    if (!calls.length) {
      const answer = outputText(response);
      if (!answer) throw new Error('OpenAI returned empty response');
      return { answer, providerCalls, toolCalls };
    }
    input.push(...output);
    for (const call of calls) {
      if (toolCalls >= MAX_TOOL_CALLS) throw new Error(`Превышен безопасный лимит вызовов инструментов (${MAX_TOOL_CALLS}).`);
      toolCalls += 1;
      const callId = typeof call.call_id === 'string' ? call.call_id : '';
      const name = typeof call.name === 'string' ? call.name : '';
      let args: unknown = {};
      try { args = JSON.parse(typeof call.arguments === 'string' ? call.arguments : '{}'); } catch { args = { parseError: true }; }
      const result = await options.executeTool(name, args, toolCalls);
      input.push({ type: 'function_call_output', call_id: callId, output: JSON.stringify(result) });
    }
  }
  throw new Error(`Превышен безопасный лимит обращений к модели (${MAX_PROVIDER_CALLS}).`);
}

export async function askAiChatWithTools(input: { userId: string; model: string; messages: unknown[]; userTimeZone: string; apiKey: string; actionRequestId: string; dynamicBilling?: boolean; onProgress?: (status: import('./ai-chat-progress.js').AiChatProgressStatus) => void }) {
  const requestId = input.actionRequestId; const startedAt = Date.now();
  const resolvedItemIds = new Set<string>(); const resolvedSphereIds = new Set<string>();
  const actionReports: string[] = []; const undoOperations: unknown[] = [];
  
  let providerCallCount = 0;
  const dynamicCalls: DynamicResponsesCall[] = [];
  input.onProgress?.('analyzing_request');
  console.info('[AI tools] started', { requestId, userId: input.userId, model: input.model });
  try {
    const loop = await runAiChatToolLoop({
      initialInput: input.messages,
      request: async (requestInput) => {
        const providerCallIndex = providerCallCount + 1;
        const isForcedFinalRound = providerCallIndex === MAX_PROVIDER_CALLS;
        if (isForcedFinalRound) input.onProgress?.('forming_answer');
        const providerPayload = { model: input.model, input: requestInput, ...(isForcedFinalRound ? { tool_choice: 'none' } : { tools: AI_CHAT_OPENAI_TOOLS, tool_choice: 'auto', parallel_tool_calls: false }) };
        if (input.dynamicBilling) {
          const call = await runDynamicResponsesCall({ userId: input.userId, actionId: requestId, providerCallIndex, feature: 'ai_chat', apiKey: input.apiKey, payload: providerPayload });
          dynamicCalls.push(call);
          providerCallCount = providerCallIndex;
          const response = call.responseJson as ToolResponse;
          console.info('[AI chat round] completed', { requestId, userId: input.userId, model: input.model, providerCallIndex, hadToolCall: response.output?.some((item) => item.type === 'function_call') ?? false, toolOperation: response.output?.find((item) => item.type === 'function_call')?.name ?? null, inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens, actualCreditsMilli: call.actualCreditsMilli, isForcedFinalRound });
          return response;
        }
        const response = await openAiFetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}` }, body: JSON.stringify(providerPayload) });
        if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
        const payload = await response.json() as ToolResponse;
        providerCallCount = providerCallIndex;
        await recordOpenAiUsageShadow({ userId: input.userId, actionId: requestId, requestId: `${requestId}:ai-chat:${providerCallIndex}`, providerCallIndex, feature: 'ai_chat', model: input.model, openAiResponseId: typeof payload.id === 'string' ? payload.id : null, usage: payload.usage });
        return payload;
      },
      executeTool: async (name, value, round) => {
        
        const progress = ({ search_tasks: 'searching_tasks', list_tasks: 'listing_tasks', get_task: 'reading_task', list_sectors: 'checking_sectors', task_action: 'applying_changes' } as const)[name as 'search_tasks'];
        if (progress) input.onProgress?.(progress);
        console.info('[AI chat tool] call', { requestId, userId: input.userId, providerCallIndex: providerCallCount, toolCallIndex: round, operation: name });
        if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, code: 'INVALID_ARGUMENTS', message: 'Аргументы tool должны быть объектом.' };
        if (name === 'search_tasks') {
          const result = await plannerToolsService.search(input.userId, value as PlannerSearchInput);
          result.results.forEach((item) => resolvedItemIds.add(item.id));
          console.info('[AI tools] search complete', { requestId, candidateCount: result.totalCandidates, returnedCount: result.results.length, ambiguous: result.ambiguous });
          return result;
        }
        if (name === 'list_tasks') {
          const result = await plannerToolsService.list(input.userId, value as PlannerListInput);
          result.items.forEach((item: { id: string }) => resolvedItemIds.add(item.id));
          input.onProgress?.('analyzing_retrieved_context');
          return result;
        }
        if (name === 'get_task') {
          const id = (value as { id?: unknown }).id;
          if (typeof id !== 'string') return { ok: false, code: 'INVALID_ID', message: 'id обязателен.' };
          const item = await plannerToolsService.getItem(input.userId, id);
          if (!item) return { ok: false, code: 'ITEM_NOT_FOUND', message: 'Объект не найден.' };
          resolvedItemIds.add(item.id); input.onProgress?.('analyzing_retrieved_context'); return { ok: true, item };
        }
        if (name === 'list_sectors') {
          const spheres = await plannerToolsService.listSpheres(input.userId); spheres.forEach((sphere: { id: string }) => resolvedSphereIds.add(sphere.id)); return spheres;
        }
        if (name === 'task_action') {
          const result = await plannerToolsService.action(input.userId, value as PlannerActionInput, resolvedItemIds, resolvedSphereIds, input.userTimeZone);
          if (result.ok) { actionReports.push(result.report); if ('undoOperation' in result && result.undoOperation) undoOperations.push(result.undoOperation); }
          console.info('[AI tools] action', { requestId, operation: (value as PlannerActionInput).operation, itemId: (value as PlannerActionInput).itemId, ok: result.ok });
          return result;
        }
        return { ok: false, code: 'UNKNOWN_TOOL', message: 'Неизвестный инструмент задач.' };
      }
    });
    input.onProgress?.('forming_answer');
    console.info('[AI tools] completed', { requestId, providerCalls: loop.providerCalls, toolCalls: loop.toolCalls, actionCount: actionReports.length, durationMs: Date.now() - startedAt });
    let creditsSpentMilli = 0;
    for (const call of dynamicCalls) creditsSpentMilli += (await settleDynamicResponsesCall(call)).chargedMilli;
    return { answer: loop.answer, model: input.model, taskDataChanged: actionReports.length > 0, actionReports, undoOperations, billing: { mode: input.dynamicBilling ? 'dynamic' as const : 'legacy' as const, creditsSpentMilli } };
  } catch (error) {
    await Promise.all(dynamicCalls.map((call) => refundDynamicResponsesCall(call)));
    console.info('[AI tools] completed', { requestId, actionCount: actionReports.length, durationMs: Date.now() - startedAt, failed: true });
    throw error;
  }
}
