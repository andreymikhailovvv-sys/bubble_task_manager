import assert from 'node:assert/strict';
import test from 'node:test';
import { getWebSearchProgressStatus, readOpenAiResponsesStream } from '../src/services/openai-responses-stream.service.js';

const stream = (...frames: object[]) => (async function* () {
  const encoded = new TextEncoder().encode(frames.map((frame) => `event: ${String((frame as { type?: unknown }).type)}\ndata: ${JSON.stringify(frame)}\n\n`).join(''));
  // Split inside an SSE frame to exercise incremental transport parsing.
  yield encoded.slice(0, 37);
  yield encoded.slice(37);
})();

test('SSE web search lifecycle даёт live-статусы и сохраняет completed response без изменений', async () => {
  const statuses: string[] = [];
  const response = { id: 'resp_1', output: [{ type: 'web_search_call', action: { type: 'search' } }, { type: 'message', content: [{ type: 'output_text', text: 'Ответ', annotations: [{ type: 'url_citation', url: 'https://example.com', title: 'Example', start_index: 0, end_index: 5 }] }] }], usage: { input_tokens: 12, output_tokens: 7, output_tokens_details: { reasoning_tokens: 2 } } };
  const result = await readOpenAiResponsesStream(stream(
    { type: 'response.web_search_call.in_progress' },
    { type: 'response.web_search_call.searching' },
    { type: 'response.web_search_call.completed' },
    { type: 'response.completed', response }
  ), (event) => {
    const status = getWebSearchProgressStatus(event.type);
    if (status && statuses.at(-1) !== status) statuses.push(status);
  });
  assert.deepEqual(statuses, ['searching_web', 'analyzing_web_results']);
  assert.deepEqual(result, response);
});

test('SSE без web events не создаёт статусы web search', async () => {
  const statuses: string[] = [];
  await readOpenAiResponsesStream(stream({ type: 'response.output_text.delta', delta: 'Ок' }, { type: 'response.completed', response: { id: 'resp_2', output_text: 'Ок', output: [], usage: { input_tokens: 1, output_tokens: 1 } } }), (event) => {
    const status = getWebSearchProgressStatus(event.type);
    if (status) statuses.push(status);
  });
  assert.deepEqual(statuses, []);
});

test('оборванный SSE не запускает fallback и завершается ошибкой до settlement', async () => {
  await assert.rejects(() => readOpenAiResponsesStream(stream({ type: 'response.in_progress' })), /before response\.completed/);
});
