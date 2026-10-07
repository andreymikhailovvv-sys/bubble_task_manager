import { openAiFetch } from '../lib/openai-fetch.js';
import { plannerToolsService, PLANNER_BATCH_OPERATIONS, type PlannerActionInput, type PlannerBatchActionInput, type PlannerSearchInput, type PlannerListInput } from './planner-tools.service.js';
import { providerNanoUsdToMilliCredits, recordAiCreditCharge, recordOpenAiUsageShadow, type OpenAiUsage } from './ai-usage-metering.service.js';
import { refundDynamicResponsesCall, runDynamicResponsesCall, settleDynamicResponsesCall, type DynamicResponsesCall } from './dynamic-responses-billing.service.js';
import { OPENAI_WEB_SEARCH_COST_NANO_USD } from '../config/openai-pricing.js';
import { refundAiCreditReservation, reserveAiCreditsMilli, type AiCreditReservation } from './ai-credit-wallet.service.js';
import { getWebSearchProgressStatus, readOpenAiResponsesStream } from './openai-responses-stream.service.js';

export const MAX_TOOL_CALLS = 5;
export const MAX_PROVIDER_CALLS = 6;
export const MAX_WEB_SEARCH_CALLS_PER_USER_REQUEST = 1;
export const MAX_BATCH_TASK_ACTIONS = 100;
export const WEB_SEARCH_CALL_CREDITS_MILLI = providerNanoUsdToMilliCredits(OPENAI_WEB_SEARCH_COST_NANO_USD);
export const AI_CHAT_WEB_SEARCH_TOOL = { type: 'web_search', search_context_size: 'low' } as const;
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
    description: 'Получить полный/широкий список реальных задач по структурным фильтрам. Обязательно используй для запросов «все задачи», «все просроченные», «задачи сектора X», «задачи за день/неделю». Используй search_tasks только для поиска нескольких конкретных объектов по названию или смыслу. Если hasMore=true и пользователь просил все объекты, продолжи пагинацию.',
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
    type: 'function', name: 'task_action', strict: true, description: 'Выполнить одну строго проверяемую операцию над одной задачей. Не используй последовательно для массового запроса, если доступен task_actions.',
    parameters: { type: 'object', additionalProperties: false, required: ['operation', 'itemId', 'parentTaskId', 'title', 'description', 'dueDate', 'importance', 'urgency', 'notifyBeforeMinutes', 'sphereId', 'location'], properties: {
      operation: { type: 'string', enum: ['create_task', 'create_event', 'create_subtask', 'rename', 'set_description', 'reschedule', 'clear_due_date', 'complete', 'reopen', 'delete', 'set_priority', 'set_notification', 'change_sphere'] },
      itemId: nullable('string'), parentTaskId: nullable('string'), title: nullable('string'), description: nullable('string'), dueDate: nullable('string'),
      importance: nullable('number'), urgency: nullable('number'), notifyBeforeMinutes: nullable('number'), sphereId: nullable('string'), location: nullable('string')
    } }
  },
  {
    type: 'function', name: 'task_actions', strict: true,
    description: 'Выполнить несколько проверяемых изменений над ранее найденными существующими задачами за один вызов. Используй для массовых запросов: «все», «каждый», «остальные», «весь список» и при любом изменении нескольких объектов. Не используй для создания и удаления.',
    parameters: { type: 'object', additionalProperties: false, required: ['actions'], properties: {
      actions: { type: 'array', minItems: 1, maxItems: MAX_BATCH_TASK_ACTIONS, items: { type: 'object', additionalProperties: false, required: ['operation', 'itemId', 'dueDate', 'importance', 'urgency', 'notifyBeforeMinutes', 'sphereId'], properties: {
        operation: { type: 'string', enum: PLANNER_BATCH_OPERATIONS }, itemId: { type: 'string' }, dueDate: nullable('string'), importance: nullable('number'), urgency: nullable('number'), notifyBeforeMinutes: nullable('number'), sphereId: nullable('string')
      } } }
    } }
  }
] as const;

type OpenAiOutputItem = Record<string, unknown>;
type ToolResponse = { id?: unknown; usage?: OpenAiUsage; output?: OpenAiOutputItem[]; output_text?: string };
export type WebSource = { title: string; url: string };
export type WebCitation = { startIndex: number; endIndex: number; sourceIndex: number };
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

type BatchFailure = { index: number; itemId: string; operation: string; code: string; message: string };
export async function executePlannerBatchActions(options: {
  value: unknown;
  execute: (action: PlannerActionInput) => Promise<any>;
  onSuccess?: (result: any) => void;
}) {
  const actions = (options.value as Partial<PlannerBatchActionInput> | null)?.actions;
  if (!Array.isArray(actions)) return { ok: false as const, code: 'INVALID_ARGUMENTS', message: 'actions должен быть массивом.' };
  if (actions.length === 0) return { ok: false as const, code: 'INVALID_ARGUMENTS', message: 'Пакет должен содержать хотя бы одно действие.' };
  if (actions.length > MAX_BATCH_TASK_ACTIONS) return { ok: false as const, code: 'BATCH_TOO_LARGE', message: 'За один пакет можно выполнить максимум 100 действий.' };
  const failures: BatchFailure[] = [];
  let successCount = 0;
  const seen = new Set<string>();
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index] as PlannerBatchActionInput['actions'][number];
    const operation = typeof action?.operation === 'string' ? action.operation : '';
    const itemId = typeof action?.itemId === 'string' ? action.itemId : '';
    if (!PLANNER_BATCH_OPERATIONS.includes(operation as never)) {
      failures.push({ index, itemId, operation, code: 'INVALID_BATCH_OPERATION', message: 'Операция недоступна для пакетного изменения.' });
      continue;
    }
    const key = JSON.stringify([operation, itemId, action.dueDate, action.importance, action.urgency, action.notifyBeforeMinutes, action.sphereId]);
    if (seen.has(key)) {
      failures.push({ index, itemId, operation, code: 'DUPLICATE_ACTION', message: 'Идентичное действие уже присутствует в пакете.' });
      continue;
    }
    seen.add(key);
    const plannerAction: PlannerActionInput = { operation: action.operation, itemId, parentTaskId: null, title: null, description: null, dueDate: action.dueDate, importance: action.importance, urgency: action.urgency, notifyBeforeMinutes: action.notifyBeforeMinutes, sphereId: action.sphereId, location: null };
    try {
      const result = await options.execute(plannerAction);
      if (result?.ok) { successCount += 1; options.onSuccess?.(result); }
      else failures.push({ index, itemId, operation, code: typeof result?.code === 'string' ? result.code : 'ACTION_FAILED', message: typeof result?.message === 'string' ? result.message : 'Не удалось выполнить действие.' });
    } catch (error) {
      failures.push({ index, itemId, operation, code: 'ACTION_FAILED', message: error instanceof Error ? error.message : 'Не удалось выполнить действие.' });
    }
  }
  const failureCount = failures.length;
  return { ok: failureCount === 0, requestedCount: actions.length, successCount, failureCount, partial: successCount > 0 && failureCount > 0, failures };
}

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
  let batchToolCalls = 0; let batchActionsRequested = 0; let batchActionsSucceeded = 0; let batchActionsFailed = 0;
  
  let providerCallCount = 0;
  let inputTokensTotal = 0; let outputTokensTotal = 0; const toolOperations: string[] = [];
  const dynamicCalls: DynamicResponsesCall[] = [];
  let webReservation: AiCreditReservation | null = null;
  let webSearchAvailable = Boolean(input.dynamicBilling);
  let webSearchUsed = false;
  let webSearchCallsActual = 0;
  let webSearchSearchItemsRaw = 0;
  let webSearchDuplicateItems = 0;
  let providerWebSearchCostMilli = 0;
  let webSearchProgressObserved = false;
  let lastProgress: import('./ai-chat-progress.js').AiChatProgressStatus | null = null;
  const emitProgress = (status: import('./ai-chat-progress.js').AiChatProgressStatus) => {
    if (lastProgress === status) return;
    lastProgress = status;
    input.onProgress?.(status);
  };
  const observeProviderEvent = (event: { type?: unknown }) => {
    const progress = getWebSearchProgressStatus(event.type);
    if (progress) {
      webSearchProgressObserved = true;
      emitProgress(progress);
    }
  };
  const webSources: WebSource[] = []; const webCitations: WebCitation[] = []; const sourceByUrl = new Map<string, number>();
  if (webSearchAvailable) {
    try { webReservation = await reserveAiCreditsMilli(input.userId, WEB_SEARCH_CALL_CREDITS_MILLI); }
    catch (error) { if (error instanceof Error && error.message === 'Недостаточно AI кредитов') webSearchAvailable = false; else throw error; }
  }
  emitProgress('analyzing_request');
  console.info('[AI tools] started', { requestId, userId: input.userId, model: input.model });
  try {
    const loop = await runAiChatToolLoop({
      initialInput: input.messages,
      request: async (requestInput) => {
        const providerCallIndex = providerCallCount + 1;
        const isForcedFinalRound = providerCallIndex === MAX_PROVIDER_CALLS;
        if (isForcedFinalRound) emitProgress('forming_answer');
        const includeWebSearch = !isForcedFinalRound && webSearchAvailable && !webSearchUsed;
        const tools = includeWebSearch ? [...AI_CHAT_OPENAI_TOOLS, AI_CHAT_WEB_SEARCH_TOOL] : AI_CHAT_OPENAI_TOOLS;
        const providerPayload = { model: input.model, input: requestInput, ...(isForcedFinalRound ? { tool_choice: 'none' } : { tools, tool_choice: 'auto', parallel_tool_calls: false, ...(includeWebSearch ? { max_tool_calls: 1 } : {}) }) };
        if (input.dynamicBilling) {
          let call: DynamicResponsesCall;
          try { call = await runDynamicResponsesCall({ userId: input.userId, actionId: requestId, providerCallIndex, feature: 'ai_chat', apiKey: input.apiKey, payload: providerPayload, stream: true, onProviderEvent: observeProviderEvent }); }
          catch (error) {
            if (includeWebSearch && !webSearchUsed && webReservation && error instanceof Error && error.message === 'Недостаточно AI кредитов') {
              await refundAiCreditReservation(webReservation); webReservation = null; webSearchAvailable = false;
              call = await runDynamicResponsesCall({ userId: input.userId, actionId: requestId, providerCallIndex, feature: 'ai_chat', apiKey: input.apiKey, payload: { ...providerPayload, tools: AI_CHAT_OPENAI_TOOLS, max_tool_calls: undefined }, stream: true, onProviderEvent: observeProviderEvent });
            } else throw error;
          }
          dynamicCalls.push(call);
          providerCallCount = providerCallIndex;
          const response = call.responseJson as ToolResponse;
          inputTokensTotal += typeof response.usage?.input_tokens === 'number' ? response.usage.input_tokens : 0;
          outputTokensTotal += typeof response.usage?.output_tokens === 'number' ? response.usage.output_tokens : 0;
          webSearchCallsActual += call.webSearchCallsActual;
          webSearchSearchItemsRaw += call.webSearchSearchItemsRaw;
          webSearchDuplicateItems += call.webSearchDuplicateItems;
          providerWebSearchCostMilli += call.webSearchCreditsMilliProvider;
          if (call.webSearchCallsActual > MAX_WEB_SEARCH_CALLS_PER_USER_REQUEST) {
            console.error('[AI web search] hard limit violation', { requestId, model: input.model, providerCallIndex, responseId: typeof response.id === 'string' ? response.id : null, configuredMaxToolCalls: MAX_WEB_SEARCH_CALLS_PER_USER_REQUEST, searchActionsRaw: call.webSearchSearchItemsRaw, uniqueSearchCalls: call.webSearchCallsActual - call.webSearchCallsWithoutId, searchCallsWithoutId: call.webSearchCallsWithoutId, duplicateSearchItems: call.webSearchDuplicateItems, actionTypes: call.webSearchActionTypes });
          }
          if (call.webSearchCallsActual > 0 && !webSearchUsed) {
            webSearchUsed = true; toolOperations.push('web_search');
            for (const item of response.output ?? []) for (const part of Array.isArray(item.content) ? item.content : []) {
              if (!part || typeof part !== 'object') continue;
              for (const annotation of Array.isArray((part as { annotations?: unknown }).annotations) ? (part as { annotations: Array<Record<string, unknown>> }).annotations : []) {
                if (annotation.type !== 'url_citation' || typeof annotation.url !== 'string') continue;
                let sourceIndex = sourceByUrl.get(annotation.url);
                if (sourceIndex === undefined) { sourceIndex = webSources.length; sourceByUrl.set(annotation.url, sourceIndex); webSources.push({ url: annotation.url, title: typeof annotation.title === 'string' && annotation.title.trim() ? annotation.title.trim() : annotation.url }); }
                if (typeof annotation.start_index === 'number' && typeof annotation.end_index === 'number') webCitations.push({ startIndex: annotation.start_index, endIndex: annotation.end_index, sourceIndex });
              }
            }
            console.info('[AI web search] completed', { requestId, model: input.model, providerCallIndex, sourceCount: webSources.length, searchActionsRaw: call.webSearchSearchItemsRaw, uniqueSearchCalls: call.webSearchCallsActual - call.webSearchCallsWithoutId, searchCallsWithoutId: call.webSearchCallsWithoutId, duplicateSearchItems: call.webSearchDuplicateItems, billedSearchCalls: 1, fixedCreditsMilliBilled: WEB_SEARCH_CALL_CREDITS_MILLI, providerWebSearchCreditsMilli: call.webSearchCreditsMilliProvider });
          }
          console.info('[AI chat round] completed', { requestId, userId: input.userId, model: input.model, providerCallIndex, hadToolCall: response.output?.some((item) => item.type === 'function_call') ?? false, toolOperation: response.output?.find((item) => item.type === 'function_call')?.name ?? null, inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens, actualCreditsMilli: call.actualCreditsMilli, isForcedFinalRound });
          return response;
        }
        const response = await openAiFetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}` }, body: JSON.stringify({ ...providerPayload, stream: true }) });
        if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
        const payload = await readOpenAiResponsesStream(response.body, observeProviderEvent) as ToolResponse;
        inputTokensTotal += typeof payload.usage?.input_tokens === 'number' ? payload.usage.input_tokens : 0;
        outputTokensTotal += typeof payload.usage?.output_tokens === 'number' ? payload.usage.output_tokens : 0;
        providerCallCount = providerCallIndex;
        await recordOpenAiUsageShadow({ userId: input.userId, actionId: requestId, requestId: `${requestId}:ai-chat:${providerCallIndex}`, providerCallIndex, feature: 'ai_chat', model: input.model, openAiResponseId: typeof payload.id === 'string' ? payload.id : null, usage: payload.usage });
        return payload;
      },
      executeTool: async (name, value, round) => {
        toolOperations.push(name);
        
        const progress = ({ search_tasks: 'searching_tasks', list_tasks: 'listing_tasks', get_task: 'reading_task', list_sectors: 'checking_sectors', task_action: 'applying_changes', task_actions: 'applying_changes' } as const)[name as 'search_tasks'];
        if (progress) emitProgress(progress);
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
          const listInput = value as PlannerListInput;
          console.info('[AI tools] list complete', { requestId, itemType: listInput.itemType, statusScope: listInput.statusScope, dueFromUsed: Boolean(listInput.dueFrom), dueToUsed: Boolean(listInput.dueTo), sphereFilterUsed: Boolean(listInput.sphereId), offset: result.offset, limit: listInput.limit, total: result.total, count: result.count, hasMore: result.hasMore, nextOffset: result.nextOffset });
          emitProgress('analyzing_retrieved_context');
          return result;
        }
        if (name === 'get_task') {
          const id = (value as { id?: unknown }).id;
          if (typeof id !== 'string') return { ok: false, code: 'INVALID_ID', message: 'id обязателен.' };
          const item = await plannerToolsService.getItem(input.userId, id);
          if (!item) return { ok: false, code: 'ITEM_NOT_FOUND', message: 'Объект не найден.' };
          resolvedItemIds.add(item.id); emitProgress('analyzing_retrieved_context'); return { ok: true, item };
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
        if (name === 'task_actions') {
          batchToolCalls += 1;
          const result = await executePlannerBatchActions({ value,
            execute: (action) => plannerToolsService.action(input.userId, action, resolvedItemIds, resolvedSphereIds, input.userTimeZone),
            onSuccess: (success) => { actionReports.push(success.report); if (success.undoOperation) undoOperations.push(success.undoOperation); }
          });
          if (typeof result.requestedCount === 'number' && typeof result.successCount === 'number' && typeof result.failureCount === 'number') {
            batchActionsRequested += result.requestedCount; batchActionsSucceeded += result.successCount; batchActionsFailed += result.failureCount;
            const operationCounts: Record<string, number> = {};
            for (const action of (value as PlannerBatchActionInput).actions) operationCounts[action.operation] = (operationCounts[action.operation] ?? 0) + 1;
            console.info('[AI tools] batch action completed', { requestId, requestedCount: result.requestedCount, successCount: result.successCount, failureCount: result.failureCount, operationCounts });
          }
          return result;
        }
        return { ok: false, code: 'UNKNOWN_TOOL', message: 'Неизвестный инструмент задач.' };
      }
    });
    emitProgress('forming_answer');
    console.info('[AI tools] completed', { requestId, providerCalls: loop.providerCalls, toolCalls: loop.toolCalls, actionCount: actionReports.length, durationMs: Date.now() - startedAt });
    let creditsSpentMilli = 0;
    for (const call of dynamicCalls) creditsSpentMilli += (await settleDynamicResponsesCall(call)).chargedMilli;
    if (webReservation) {
      if (webSearchUsed) {
        creditsSpentMilli += webReservation.totalMilli;
        await recordAiCreditCharge({
          userId: input.userId,
          actionId: requestId,
          requestId: `${requestId}:web-search-charge`,
          feature: 'web_search',
          model: 'openai-web-search',
          creditsSpentMilli: webReservation.totalMilli
        });
      } else {
        await refundAiCreditReservation(webReservation);
        webReservation = null;
      }
    }
    const webSearchCallsBilled = webSearchUsed ? MAX_WEB_SEARCH_CALLS_PER_USER_REQUEST : 0;
    const webSearchCreditsMilliBilled = webSearchCallsBilled * WEB_SEARCH_CALL_CREDITS_MILLI;
    return { answer: loop.answer, model: input.model, taskDataChanged: actionReports.length > 0, actionReports, undoOperations, webSearchUsed, webSources, webCitations, billing: { mode: input.dynamicBilling ? 'dynamic' as const : 'legacy' as const, creditsSpentMilli }, workflowDiagnostics: { providerStreaming: true, webSearchProgressObserved, providerCalls: loop.providerCalls, toolCalls: loop.toolCalls, toolOperations, batchToolCalls, batchActionsRequested, batchActionsSucceeded, batchActionsFailed, inputTokensTotal, outputTokensTotal, webSearchUsed, webSearchCallsActual, webSearchCallsBilled, webSearchLimit: MAX_WEB_SEARCH_CALLS_PER_USER_REQUEST, webSearchLimitExceeded: webSearchCallsActual > MAX_WEB_SEARCH_CALLS_PER_USER_REQUEST, webSearchDuplicateItems, webSearchSearchItemsRaw, webSearchCreditsMilliBilled, providerWebSearchCostMilli, webSearchCalls: webSearchCallsActual, webSearchCreditsMilli: webSearchCreditsMilliBilled, webSourceCount: webSources.length } };
  } catch (error) {
    await Promise.all(dynamicCalls.map((call) => refundDynamicResponsesCall(call)));
    if (webReservation) await refundAiCreditReservation(webReservation);
    console.info('[AI tools] completed', { requestId, actionCount: actionReports.length, durationMs: Date.now() - startedAt, failed: true });
    throw error;
  }
}
