import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTaskChatOpenAiPayload, createTaskChatInputTokensPayload } from '../src/services/ai-assistant.service.js';
import { AI_CHAT_WEB_SEARCH_TOOL, WEB_SEARCH_CALL_CREDITS_MILLI } from '../src/services/ai-chat-tools.service.js';
import { analyzeWebSearchCalls } from '../src/services/dynamic-responses-billing.service.js';

test('task chat exposes one optional web search and never on forced final round', () => {
  const messages = [{ role: 'user' as const, content: 'Какая погода?' }];
  const enabled = createTaskChatOpenAiPayload('gpt-5.4-mini', messages, 300, { allowWebSearch: true });
  assert.deepEqual(enabled.tools?.at(-1), AI_CHAT_WEB_SEARCH_TOOL);
  assert.equal(enabled.max_tool_calls, 1);
  const ordinary = createTaskChatOpenAiPayload('gpt-5.4-mini', messages);
  assert.equal(ordinary.tools?.some(item => item.type === 'web_search'), false);
  const forced = createTaskChatOpenAiPayload('gpt-5.4-mini', messages, undefined, { allowTools: false, allowWebSearch: true });
  assert.equal('tools' in forced, false);
});

test('task chat input token preflight strips response-only max_tool_calls while keeping search and all other tools', () => {
  const payload = createTaskChatOpenAiPayload('gpt-6-luna', [{ role: 'user', content: 'Найди актуальные факты' }], undefined, { allowWebSearch: true });
  assert.equal(payload.max_tool_calls, 1);
  const preflight = createTaskChatInputTokensPayload(payload);
  assert.equal('max_tool_calls' in preflight, false);
  assert.equal(preflight.model, payload.model);
  assert.deepEqual(preflight.input, payload.input);
  assert.deepEqual(preflight.tools, payload.tools);
  assert.deepEqual(preflight.text, payload.text);
  assert.equal(preflight.tool_choice, payload.tool_choice);
  assert.equal(preflight.parallel_tool_calls, payload.parallel_tool_calls);
  assert.equal(payload.max_tool_calls, 1, 'the actual response request keeps its web search limit');

  const withoutSearch = createTaskChatOpenAiPayload('gpt-6-luna', [{ role: 'user', content: 'Привет' }]);
  assert.deepEqual(createTaskChatInputTokensPayload(withoutSearch), withoutSearch);
});

test('one provider search action counts once despite duplicated response items', () => {
  const analysis = analyzeWebSearchCalls({ output: [
    { type: 'web_search_call', id: 'ws_1', action: { type: 'search' } },
    { type: 'web_search_call', id: 'ws_1', action: { type: 'search' } }
  ] });
  assert.equal(analysis.uniqueSearchCalls + analysis.searchCallsWithoutId, 1);
  assert.ok(WEB_SEARCH_CALL_CREDITS_MILLI > 0);
});

test('task web search uses reserved credits with separate usage event and sources', async () => {
  const source = await readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  assert.match(source, /webReservation = await reserveAiCreditsMilli\(input\.userId, WEB_SEARCH_CALL_CREDITS_MILLI\)/);
  assert.match(source, /const webSearchAnalysis = analyzeWebSearchCalls\(responseJson\)/);
  assert.match(source, /!webSearchUsed && !isForcedFinalRound/);
  assert.doesNotMatch(source, /!isForcedFinalRound && modelProviderCallIndex === 0/);
  assert.match(source, /settleAiCreditReservation\(webReservation, WEB_SEARCH_CALL_CREDITS_MILLI\)/);
  assert.match(source, /feature: 'web_search'/);
  assert.match(source, /refundWalletReservation\(webReservation\)/);
  assert.match(source, /webSources: sources, webCitations/);
  assert.match(source, /getWebSearchProgressStatus\(event\.type\)/);
  assert.match(source, /readOpenAiResponsesStreamWithRecovery\(openAiResponse\.body/);
});


test('automatic monitoring keeps web search after a first non-search tool and exposes note tools only when enabled', () => {
  const messages = [{ role: 'user' as const, content: 'Подготовь исследование и заметку' }];
  const monitored = createTaskChatOpenAiPayload('gpt-6-luna', messages, 512, {
    allowWebSearch: true, monitoringTools: true, monitoringNoteTools: true
  });
  const names = monitored.tools?.filter(tool => tool.type === 'function').map(tool => 'name' in tool ? tool.name : '');
  assert.ok(names?.includes('create_note'));
  assert.ok(names?.includes('read_note'));
  assert.ok(names?.includes('update_note'));
  assert.equal(monitored.tools?.filter(tool => tool.type === 'web_search').length, 1);
  const normal = createTaskChatOpenAiPayload('gpt-6-luna', messages, 512, { allowWebSearch: true });
  assert.equal(normal.tools?.some(tool => 'name' in tool && tool.name === 'update_note'), false);
});
