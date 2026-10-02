import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_TOOL_CALLS, runAiChatToolLoop } from '../src/services/ai-chat-tools.service.js';

test('tool loop выполняет search, action один раз и возвращает финальный текст', async () => {
  const responses = [
    { output: [{ type: 'reasoning', id: 'reason-1' }, { type: 'function_call', call_id: 'call-1', name: 'search_planner_items', arguments: '{}' }] },
    { output: [{ type: 'function_call', call_id: 'call-2', name: 'planner_action', arguments: '{}' }] },
    { output_text: 'Перенёс презентацию на пятницу.', output: [] }
  ];
  const calls: string[] = []; const requestInputs: unknown[][] = [];
  const result = await runAiChatToolLoop({ initialInput: [{ role: 'user', content: 'Перенеси её' }], request: async (input) => { requestInputs.push([...input]); return responses.shift()!; }, executeTool: async (name) => { calls.push(name); return { ok: true }; } });
  assert.equal(result.answer, 'Перенёс презентацию на пятницу.'); assert.deepEqual(calls, ['search_planner_items', 'planner_action']);
  assert.deepEqual(requestInputs[1][1], { type: 'reasoning', id: 'reason-1' }, 'provider item должен переноситься без sanitization');
  assert.deepEqual(requestInputs[1][2], { type: 'function_call', call_id: 'call-1', name: 'search_planner_items', arguments: '{}' });
  assert.deepEqual(requestInputs[1][3], { type: 'function_call_output', call_id: 'call-1', output: '{"ok":true}' });
});

test('обычный вопрос завершается без tools', async () => {
  let executions = 0;
  const result = await runAiChatToolLoop({ initialInput: [], request: async () => ({ output_text: 'Из-за рассеяния света.', output: [] }), executeTool: async () => { executions += 1; } });
  assert.equal(result.answer, 'Из-за рассеяния света.'); assert.equal(executions, 0); assert.equal(result.toolCalls, 0);
});

test('tool loop безопасно останавливается после пяти tool calls', async () => {
  await assert.rejects(() => runAiChatToolLoop({ initialInput: [], request: async () => ({ output: [{ type: 'function_call', call_id: 'loop', name: 'search_planner_items', arguments: '{}' }] }), executeTool: async () => ({ ok: true }) }), new RegExp(String(MAX_TOOL_CALLS)));
});
