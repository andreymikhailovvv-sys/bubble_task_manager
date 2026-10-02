type OpenAiStreamEvent = { type?: unknown; response?: unknown; error?: unknown };

export function getWebSearchProgressStatus(type: unknown): 'searching_web' | 'analyzing_web_results' | null {
  if (type === 'response.web_search_call.in_progress' || type === 'response.web_search_call.searching') return 'searching_web';
  if (type === 'response.web_search_call.completed') return 'analyzing_web_results';
  return null;
}

/**
 * Consumes the Responses API SSE transport and returns the authoritative object
 * carried by response.completed. Delta events are deliberately not used to
 * rebuild business data: the completed object contains output items,
 * annotations, reasoning details and usage in exactly the regular API shape.
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
    if (event.type === 'response.completed' && event.response && typeof event.response === 'object') completed = event.response as Record<string, unknown>;
    if (event.type === 'response.failed' || event.type === 'error') throw new Error('OpenAI streaming response failed');
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
