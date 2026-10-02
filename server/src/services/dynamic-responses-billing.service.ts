import { openAiFetch } from '../lib/openai-fetch.js';
import { calculateAffordableOutputTokens, calculateMaximumRequestCreditsMilli, calculateOpenAiUsageCost, recordOpenAiUsageShadow, type OpenAiUsage } from './ai-usage-metering.service.js';
import { refundAiCreditReservation, reserveAiCreditsMilliUpTo, settleAiCreditReservation, type AiCreditReservation } from './ai-credit-wallet.service.js';
import { readOpenAiResponsesStream } from './openai-responses-stream.service.js';

export type DynamicTextFeature = 'ai_chat' | 'ai_chat_planner' | 'general_assistant' | 'recurrence' | 'generate_subtasks' | 'generate_task' | 'optimize_timeline' | 'overdue_postpone';

export const DYNAMIC_TEXT_OUTPUT_LIMITS: Record<DynamicTextFeature, { min: number; max: number }> = {
  ai_chat: { min: 512, max: 4096 },
  ai_chat_planner: { min: 256, max: 4096 },
  general_assistant: { min: 512, max: 4096 },
  recurrence: { min: 128, max: 1024 },
  generate_subtasks: { min: 256, max: 2048 },
  generate_task: { min: 512, max: 4096 },
  optimize_timeline: { min: 256, max: 4096 },
  overdue_postpone: { min: 256, max: 2048 }
};

export const isDynamicTextBillingEnabled = (userId: string) => {
  if (process.env.AI_DYNAMIC_TEXT_BILLING_ENABLED?.trim().toLowerCase() !== 'true') return false;
  const allowlist = (process.env.AI_DYNAMIC_TEXT_BILLING_USER_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  return allowlist.length === 0 || allowlist.includes(userId);
};

const PROVIDER_KEYS = ['model', 'input', 'instructions', 'tools', 'tool_choice', 'parallel_tool_calls', 'max_tool_calls', 'reasoning', 'text', 'temperature', 'top_p'] as const;
export function createCleanOpenAiResponsesPayload(payload: Record<string, unknown>) {
  return Object.fromEntries(PROVIDER_KEYS.filter((key) => payload[key] !== undefined).map((key) => [key, payload[key]]));
}

export function getOpenAiPreflightErrorDiagnostics(body: unknown) {
  const root = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
  const error = typeof root.error === 'object' && root.error !== null ? root.error as Record<string, unknown> : {};
  const safeString = (value: unknown) => typeof value === 'string' ? value : null;
  return {
    providerErrorType: safeString(error.type),
    providerErrorCode: safeString(error.code),
    providerErrorParam: safeString(error.param)
  };
}

export type DynamicResponsesCall = {
  responseJson: { id?: unknown; usage?: OpenAiUsage; [key: string]: unknown };
  reservation: AiCreditReservation;
  actualCreditsMilli: number;
  webSearchCalls: number;
  webSearchCreditsMilli: number;
};

export async function runDynamicResponsesCall(input: { userId: string; actionId: string; providerCallIndex: number; feature: DynamicTextFeature; apiKey: string; payload: Record<string, unknown>; stream?: boolean; onProviderEvent?: (event: { type?: unknown }) => void }): Promise<DynamicResponsesCall> {
  const limits = DYNAMIC_TEXT_OUTPUT_LIMITS[input.feature];
  const cleanPayload = createCleanOpenAiResponsesPayload(input.payload);
  const model = String(cleanPayload.model ?? '');
  const tokenRequestId = `${input.actionId}:tokens:${input.providerCallIndex}`;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}` };
  let preflight;
  try {
    const { max_tool_calls: _maxToolCalls, ...preflightPayload } = cleanPayload;
    preflight = await openAiFetch('https://api.openai.com/v1/responses/input_tokens', { method: 'POST', headers: { ...headers, 'X-Client-Request-Id': tokenRequestId }, body: JSON.stringify(preflightPayload) });
  } catch (error) {
    console.error('[AI dynamic billing] input token preflight failed', { actionId: input.actionId, requestId: tokenRequestId, feature: input.feature, model, status: 'network' });
    throw error;
  }
  if (!preflight.ok) {
    let errorBody: unknown = null;
    try {
      errorBody = await preflight.json();
    } catch {
      // An invalid provider response body must not hide the original HTTP failure.
    }
    console.error('[AI dynamic billing] input token preflight failed', { actionId: input.actionId, requestId: tokenRequestId, feature: input.feature, model, status: preflight.status, ...getOpenAiPreflightErrorDiagnostics(errorBody) });
    throw new Error(`AI_DYNAMIC_PREFLIGHT_FAILED: OpenAI input token preflight failed: ${preflight.status}`);
  }
  const tokenJson = await preflight.json() as { input_tokens?: unknown };
  const inputTokens = typeof tokenJson.input_tokens === 'number' && tokenJson.input_tokens >= 0 ? Math.floor(tokenJson.input_tokens) : null;
  if (inputTokens === null) throw new Error('AI_DYNAMIC_PREFLIGHT_FAILED: OpenAI input token preflight returned invalid usage');
  const minimum = calculateMaximumRequestCreditsMilli({ model, inputTokens, maxOutputTokens: limits.min }).totalCreditsMilli;
  const desired = calculateMaximumRequestCreditsMilli({ model, inputTokens, maxOutputTokens: limits.max }).totalCreditsMilli;
  const reservation = await reserveAiCreditsMilliUpTo(input.userId, minimum, desired);
  const inputCost = calculateMaximumRequestCreditsMilli({ model, inputTokens, maxOutputTokens: 0 }).inputCreditsMilli;
  const affordable = calculateAffordableOutputTokens(model, inputTokens, Math.max(0, reservation.totalMilli - inputCost));
  const maxOutputTokens = Math.max(limits.min, Math.min(limits.max, affordable));
  try {
    const requestId = `${input.actionId}:response:${input.providerCallIndex}`;
    const response = await openAiFetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { ...headers, 'X-Client-Request-Id': requestId }, body: JSON.stringify({ ...cleanPayload, max_output_tokens: maxOutputTokens, ...(input.stream ? { stream: true } : {}) }) });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    const responseJson = (input.stream
      ? await readOpenAiResponsesStream(response.body, input.onProviderEvent)
      : await response.json()) as DynamicResponsesCall['responseJson'];
    const output = Array.isArray(responseJson.output) ? responseJson.output as Array<Record<string, unknown>> : [];
    const webSearchCalls = input.feature === 'ai_chat' ? output.filter((item) => item.type === 'web_search_call' && (item.action as Record<string, unknown> | undefined)?.type === 'search').length : 0;
    const { OPENAI_WEB_SEARCH_COST_NANO_USD } = await import('../config/openai-pricing.js');
    const extraProviderCostNanoUsd = BigInt(webSearchCalls) * OPENAI_WEB_SEARCH_COST_NANO_USD;
    await recordOpenAiUsageShadow({ userId: input.userId, actionId: input.actionId, requestId, providerCallIndex: input.providerCallIndex, feature: input.feature, model, openAiResponseId: typeof responseJson.id === 'string' ? responseJson.id : null, usage: responseJson.usage, billingMode: 'DYNAMIC', extraProviderCostNanoUsd });
    const actualCreditsMilli = calculateOpenAiUsageCost(model, responseJson.usage ?? {}).estimatedCreditsMilli;
    if (actualCreditsMilli === null) throw new Error(`Unknown OpenAI pricing for model "${model}"`);
    return { responseJson, reservation, actualCreditsMilli, webSearchCalls, webSearchCreditsMilli: Number((extraProviderCostNanoUsd + 599n) / 600n) };
  } catch (error) {
    await refundAiCreditReservation(reservation);
    throw error;
  }
}

export const settleDynamicResponsesCall = (call: DynamicResponsesCall) => settleAiCreditReservation(call.reservation, call.actualCreditsMilli);
export const refundDynamicResponsesCall = (call: DynamicResponsesCall) => refundAiCreditReservation(call.reservation);
