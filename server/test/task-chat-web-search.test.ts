import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTaskChatOpenAiPayload } from '../src/services/ai-assistant.service.js';
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
  assert.match(source, /!webSearchUsed && !isForcedFinalRound && modelProviderCallIndex === 0/);
  assert.match(source, /settleAiCreditReservation\(webReservation, WEB_SEARCH_CALL_CREDITS_MILLI\)/);
  assert.match(source, /feature: 'web_search'/);
  assert.match(source, /refundWalletReservation\(webReservation\)/);
  assert.match(source, /webSearchUsed && sources\.length/);
});
