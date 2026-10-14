import assert from 'node:assert/strict';
import test from 'node:test';
import { getWebSearchProgressStatus, readOpenAiResponsesStream, readOpenAiResponsesStreamWithRecovery, OpenAiResponseTerminalError } from '../src/services/openai-responses-stream.service.js';

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


test('обрыв SSE после response.created восстанавливает готовый ответ по ID без повторного POST', async () => {
  const response = { id: 'resp_123', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Длинный готовый ответ' }] }], usage: { input_tokens: 4200, output_tokens: 1700 } };
  const seen: string[] = [];
  const recovered = await readOpenAiResponsesStreamWithRecovery(stream(
    { type: 'response.created', response: { id: response.id, status: 'in_progress' } },
    { type: 'response.output_text.delta', delta: 'Неполный фрагмент' }
  ), {
    onEvent: (event) => seen.push(String(event.type)),
    retrieveResponse: async (id) => {
      assert.equal(id, response.id);
      return response;
    },
    sleep: async () => { throw new Error('should not delay on first recovery attempt'); }
  });
  assert.deepEqual(recovered, response);
  assert.deepEqual(seen, ['response.created', 'response.output_text.delta']);
});

test('обрыв соединения при чтении тела восстанавливается после временного статуса in_progress', async () => {
  const interrupted = async function* () {
    yield new TextEncoder().encode('event: response.created\ndata: {"type":"response.created","response":{"id":"resp_456"}}\n\n');
    throw new Error('UND_ERR_SOCKET');
  };
  const queried: string[] = [];
  const delays: number[] = [];
  const result = await readOpenAiResponsesStreamWithRecovery(interrupted(), {
    retrieveResponse: async (id) => {
      queried.push(id);
      if (queried.length === 1) return { id, status: 'in_progress' };
      return { id, status: 'completed', output: [], usage: { input_tokens: 40, output_tokens: 0 } };
    },
    sleep: async (ms) => { delays.push(ms); }
  });
  assert.equal(result.status, 'completed');
  assert.deepEqual(queried, ['resp_456', 'resp_456']);
  assert.deepEqual(delays, [650]);
});

test('успешный SSE не запускает восстановление и не дублирует оплату', async () => {
  const original = { id: 'resp_ok', status: 'completed', output: [], usage: {} };
  const result = await readOpenAiResponsesStreamWithRecovery(stream(
    { type: 'response.created', response: { id: original.id } },
    { type: 'response.completed', response: original }
  ), { retrieveResponse: async () => { throw new Error('GET must not run'); } });
  assert.deepEqual(result, original);
});

test('response.incomplete с лимитом выходных токенов не считается сетевой ошибкой', async () => {
  let retrievals = 0;
  await assert.rejects(() => readOpenAiResponsesStreamWithRecovery(stream(
    { type: 'response.created', response: { id: 'resp_limited' } },
    { type: 'response.incomplete', response: { id: 'resp_limited', incomplete_details: { reason: 'max_output_tokens' } } }
  ), { retrieveResponse: async () => { retrievals++; return {}; } }), (error: unknown) => {
    assert.ok(error instanceof OpenAiResponseTerminalError);
    assert.equal(error.reason, 'max_output_tokens');
    return true;
  });
  assert.equal(retrievals, 0);
});

test('response.failed не выдаёт фрагменты инструмента за завершённый ответ', async () => {
  await assert.rejects(() => readOpenAiResponsesStreamWithRecovery(stream(
    { type: 'response.created', response: { id: 'resp_fail' } },
    { type: 'response.failed', response: { id: 'resp_fail' } }
  ), { retrieveResponse: async () => { throw new Error('never retrieve failed response'); } }), OpenAiResponseTerminalError);
});

test('обрыв до появления response.id не запускает повторный платный POST', async () => {
  let attempted = 0;
  await assert.rejects(() => readOpenAiResponsesStreamWithRecovery(stream(
    { type: 'response.output_text.delta', delta: 'неполный фрагмент' }
  ), { retrieveResponse: async () => { attempted++; return {}; } }), /before response\.completed/);
  assert.equal(attempted, 0);
});

test('восстановление не принимает неполный ответ и ограничено по числу запросов GET', async () => {
  let attempts = 0;
  await assert.rejects(() => readOpenAiResponsesStreamWithRecovery(stream(
    { type: 'response.created', response: { id: 'resp_pending' } }
  ), {
    retrieveResponse: async (id) => { attempts++; return { id, status: 'in_progress' }; },
    sleep: async () => {}
  }), /восстановить не удалось/);
  assert.equal(attempts, 5);
});

test('если GET показывает неполный ответ, восстановление завершается понятной ошибкой', async () => {
  await assert.rejects(() => readOpenAiResponsesStreamWithRecovery(stream(
    { type: 'response.created', response: { id: 'resp_incomplete' } }
  ), {
    retrieveResponse: async (id) => ({ id, status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }),
    sleep: async () => {}
  }), (error: unknown) => {
    assert.ok(error instanceof OpenAiResponseTerminalError);
    assert.equal(error.status, 'incomplete');
    return true;
  });
});
