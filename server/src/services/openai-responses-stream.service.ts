import { openAiFetch } from '../lib/openai-fetch.js';

type OpenAiStreamEvent = { type?: unknown; response?: unknown; error?: unknown };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;

export class OpenAiResponseTerminalError extends Error {
  constructor(public readonly status: 'failed' | 'incomplete' | 'cancelled', public readonly reason: string | null = null) {
    super(status === 'incomplete'
      ? 'OpenAI завершил генерацию без полного ответа (лимит выходных токенов или другая причина). Попробуйте разбить запрос на части.'
      : 'OpenAI не завершил обработку запроса. Повторите запрос.');
    this.name = 'OpenAiResponseTerminalError';
  }
}

export function getWebSearchProgressStatus(type: unknown): 'searching_web' | 'analyzing_web_results' | null {
  if (type === 'response.web_search_call.in_progress' || type === 'response.web_search_call.searching') return 'searching_web';
  if (type === 'response.web_search_call.completed') return 'analyzing_web_results';
  return null;
}

/**
 * Consumes the Responses API SSE transport and returns the authoritative object
 * carried by response.completed. Deltas are not trusted as completed tool calls.
 */
export async function readOpenAiResponsesStream(
  body: AsyncIterable<Uint8Array> | null,
  onEvent?: (event: OpenAiStreamEvent) => void
): Promise<Record<string, unknown>> {
  if (!body) throw new Error('OpenAI streaming response has no body');
  const decoder = new TextDecoder();
  let buffer = '';
  let completed: Record<string, unknown> | null = null;

  const consumeFrame = (frame: string) => {
    const data = frame.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data || data === '[DONE]') return;
    let event: OpenAiStreamEvent;
    try { event = JSON.parse(data) as OpenAiStreamEvent; }
    catch { throw new Error('OpenAI streaming response contains invalid SSE JSON'); }
    onEvent?.(event);
    if (event.type === 'response.completed' && asRecord(event.response)) completed = asRecord(event.response);
    if (event.type === 'response.incomplete' || event.type === 'response.failed' || event.type === 'error') {
      const response = asRecord(event.response);
      const details = asRecord(response?.incomplete_details);
      const reason = typeof details?.reason === 'string' ? details.reason : null;
      throw new OpenAiResponseTerminalError(event.type === 'response.incomplete' ? 'incomplete' : 'failed', reason);
    }
  };

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? '';
    for (const frame of frames) consumeFrame(frame);
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeFrame(buffer);
  if (!completed) throw new Error('OpenAI streaming response ended before response.completed');
  return completed;
}

export type OpenAiStreamRecoveryStage = 'interrupted' | 'retrieving' | 'recovered' | 'unavailable';
type RecoveryOptions = {
  retrieveResponse: (responseId: string) => Promise<Record<string, unknown>>;
  onEvent?: (event: OpenAiStreamEvent) => void;
  onRecovery?: (stage: OpenAiStreamRecoveryStage, detail: { responseId: string | null; attempt: number; eventCount: number; status?: string }) => void;
  sleep?: (milliseconds: number) => Promise<void>;
};

const RECOVERY_DELAYS_MS = [0, 650, 1500, 3000, 5000] as const;

/**
 * A proxy may close a successful (HTTP 200) SSE transfer before its final event.
 * Recover the SAME provider response using response.created.id, never re-POST
 * user messages (which would risk double tool execution and provider billing).
 * Only a complete, server-authoritative response may enter the tool loop.
 */
export async function readOpenAiResponsesStreamWithRecovery(
  body: AsyncIterable<Uint8Array> | null,
  options: RecoveryOptions
): Promise<Record<string, unknown>> {
  let responseId: string | null = null;
  let eventCount = 0;
  let originalError: unknown;
  try {
    return await readOpenAiResponsesStream(body, (event) => {
      eventCount += 1;
      const record = asRecord(event.response);
      if (!responseId && typeof record?.id === 'string' && /^resp_[a-zA-Z0-9_-]+$/.test(record.id)) {
        responseId = record.id;
      }
      options.onEvent?.(event);
    });
  } catch (error) {
    if (error instanceof OpenAiResponseTerminalError) throw error;
    originalError = error;
  }

  options.onRecovery?.('interrupted', { responseId, attempt: 0, eventCount });
  if (!responseId) {
    options.onRecovery?.('unavailable', { responseId: null, attempt: 0, eventCount, status: 'no_response_id' });
    throw originalError;
  }
  for (let attempt = 1; attempt <= RECOVERY_DELAYS_MS.length; attempt += 1) {
    const delay = RECOVERY_DELAYS_MS[attempt - 1];
    if (delay) await (options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(delay);
    options.onRecovery?.('retrieving', { responseId, attempt, eventCount });
    try {
      const response = await options.retrieveResponse(responseId);
      const status = response.status;
      if (status === 'completed' && Array.isArray(response.output)) {
        options.onRecovery?.('recovered', { responseId, attempt, eventCount, status: 'completed' });
        return response;
      }
      if (status === 'failed' || status === 'incomplete' || status === 'cancelled') {
        const detail = asRecord(response.incomplete_details);
        throw new OpenAiResponseTerminalError(status, typeof detail?.reason === 'string' ? detail.reason : null);
      }
      // queued / in_progress may still be finishing. Wait a bounded interval.
    } catch (error) {
      if (error instanceof OpenAiResponseTerminalError) throw error;
      // A transient GET error is not permission to resend the expensive POST.
    }
  }
  options.onRecovery?.('unavailable', { responseId, attempt: RECOVERY_DELAYS_MS.length, eventCount, status: 'recovery_exhausted' });
  throw new Error('Поток ответа OpenAI прервался, а готовый ответ восстановить не удалось. Повторите запрос.');
}


/** Retrieve the exact stored response, without replaying potentially mutating tools. */
export async function retrieveOpenAiResponse(
  responseId: string,
  apiKey: string,
  requestId: string,
  model?: string
): Promise<Record<string, unknown>> {
  if (!/^resp_[a-zA-Z0-9_-]+$/.test(responseId)) throw new Error('Invalid OpenAI response identifier');
  const response = await openAiFetch(
    'https://api.openai.com/v1/responses/' + encodeURIComponent(responseId),
    { method: 'GET', headers: { Authorization: 'Bearer ' + apiKey, 'X-Client-Request-Id': requestId + ':recover' } },
    { requestId: requestId + ':recover', model }
  );
  if (!response.ok) throw new Error('OpenAI response retrieval failed: ' + response.status);
  const payload = await response.json();
  const data = asRecord(payload);
  if (!data || data.id !== responseId) throw new Error('OpenAI recovery returned an unexpected response ID');
  return data;
}
