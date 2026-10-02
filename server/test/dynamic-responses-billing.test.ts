import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeWebSearchCalls, createCleanOpenAiResponsesPayload, createOpenAiResponsesRequestPayload, DYNAMIC_TEXT_OUTPUT_LIMITS, getOpenAiPreflightErrorDiagnostics, isDynamicTextBillingEnabled } from '../src/services/dynamic-responses-billing.service.js';
import { calculateOpenAiUsageCost, providerNanoUsdToMilliCredits } from '../src/services/ai-usage-metering.service.js';
import { OPENAI_WEB_SEARCH_COST_NANO_USD } from '../src/config/openai-pricing.js';

test('dynamic text flag supports global rollout and a user allowlist', () => {
  const enabled = process.env.AI_DYNAMIC_TEXT_BILLING_ENABLED;
  const users = process.env.AI_DYNAMIC_TEXT_BILLING_USER_IDS;
  try {
    process.env.AI_DYNAMIC_TEXT_BILLING_ENABLED = 'false';
    assert.equal(isDynamicTextBillingEnabled('one'), false);
    process.env.AI_DYNAMIC_TEXT_BILLING_ENABLED = 'true';
    process.env.AI_DYNAMIC_TEXT_BILLING_USER_IDS = '';
    assert.equal(isDynamicTextBillingEnabled('one'), true);
    process.env.AI_DYNAMIC_TEXT_BILLING_USER_IDS = 'two, three';
    assert.equal(isDynamicTextBillingEnabled('one'), false);
    assert.equal(isDynamicTextBillingEnabled('two'), true);
  } finally {
    if (enabled === undefined) delete process.env.AI_DYNAMIC_TEXT_BILLING_ENABLED; else process.env.AI_DYNAMIC_TEXT_BILLING_ENABLED = enabled;
    if (users === undefined) delete process.env.AI_DYNAMIC_TEXT_BILLING_USER_IDS; else process.env.AI_DYNAMIC_TEXT_BILLING_USER_IDS = users;
  }
});

test('provider payload excludes internal metadata and preserves tool token inputs', () => {
  const clean = createCleanOpenAiResponsesPayload({ model: 'gpt-5-nano', input: [{ role: 'user', content: 'hi' }], tools: [{ type: 'function' }], tool_choice: 'auto', parallel_tool_calls: false, userId: 'secret', taskId: 'secret', billing: {}, creditsSpentMilli: 5 });
  assert.deepEqual(clean, { model: 'gpt-5-nano', input: [{ role: 'user', content: 'hi' }], tools: [{ type: 'function' }], tool_choice: 'auto', parallel_tool_calls: false });
});

test('provider payload preserves max_tool_calls for Responses API', () => {
  const clean = createCleanOpenAiResponsesPayload({ model: 'gpt-6-luna', input: [], tools: [{ type: 'web_search' }], max_tool_calls: 1, privateField: true });
  assert.equal(clean.max_tool_calls, 1);
  assert.equal('privateField' in clean, false);
  const actualRequest = createOpenAiResponsesRequestPayload(clean, 512, true);
  assert.equal(actualRequest.max_tool_calls, 1);
  assert.equal(actualRequest.stream, true);
});

test('web search analysis counts one paid search action', () => {
  assert.deepEqual(analyzeWebSearchCalls({ output: [{ type: 'web_search_call', id: 'ws_1', status: 'completed', action: { type: 'search', query: 'private' } }, { type: 'message' }] }), {
    rawWebSearchItems: 1, searchActionsRaw: 1, uniqueSearchCalls: 1, searchCallsWithoutId: 0, duplicateSearchItems: 0, openPageActions: 0, findInPageActions: 0, actionTypes: ['search']
  });
});

test('web search analysis deduplicates search actions by provider id', () => {
  const analysis = analyzeWebSearchCalls({ output: [
    { type: 'web_search_call', id: 'ws_1', action: { type: 'search' } },
    { type: 'web_search_call', id: 'ws_1', action: { type: 'search' } }
  ] });
  assert.equal(analysis.searchActionsRaw, 2);
  assert.equal(analysis.uniqueSearchCalls + analysis.searchCallsWithoutId, 1);
  assert.equal(analysis.duplicateSearchItems, 1);
});

test('web search analysis keeps unique and id-less calls separate', () => {
  const analysis = analyzeWebSearchCalls({ output: [
    { type: 'web_search_call', id: 'ws_1', action: { type: 'search' } },
    { type: 'web_search_call', id: 'ws_2', action: { type: 'search' } },
    { type: 'web_search_call', action: { type: 'search' } }
  ] });
  assert.equal(analysis.searchActionsRaw, 3);
  assert.equal(analysis.uniqueSearchCalls, 2);
  assert.equal(analysis.searchCallsWithoutId, 1);
  assert.equal(analysis.duplicateSearchItems, 0);
});

test('open_page and find_in_page are diagnostics, not paid search calls', () => {
  const analysis = analyzeWebSearchCalls({ output: [
    { type: 'web_search_call', id: 'ws_1', action: { type: 'search' } },
    { type: 'web_search_call', id: 'ws_2', action: { type: 'open_page' } },
    { type: 'web_search_call', id: 'ws_3', action: { type: 'find_in_page' } }
  ] });
  assert.equal(analysis.rawWebSearchItems, 3);
  assert.equal(analysis.uniqueSearchCalls + analysis.searchCallsWithoutId, 1);
  assert.equal(analysis.openPageActions, 1);
  assert.equal(analysis.findInPageActions, 1);
});

test('web search analysis safely handles a response without web output', () => {
  const analysis = analyzeWebSearchCalls({ output: [{ type: 'message' }] });
  assert.equal(analysis.uniqueSearchCalls + analysis.searchCallsWithoutId, 0);
  assert.equal(analysis.searchActionsRaw, 0);
  assert.equal(analysis.duplicateSearchItems, 0);
});

test('production fixture separates provider cost from the one-search user charge', () => {
  const tokenCost = calculateOpenAiUsageCost('gpt-5.4-mini', { input_tokens: 11386, output_tokens: 279, output_tokens_details: { reasoning_tokens: 42 }, total_tokens: 11665 });
  assert.equal(tokenCost.estimatedCreditsMilli, 16325);
  assert.equal(providerNanoUsdToMilliCredits((tokenCost.providerCostNanoUsd ?? 0n) + OPENAI_WEB_SEARCH_COST_NANO_USD), 32992);
  assert.equal(providerNanoUsdToMilliCredits((tokenCost.providerCostNanoUsd ?? 0n) + 2n * OPENAI_WEB_SEARCH_COST_NANO_USD), 49659);
  assert.equal(tokenCost.estimatedCreditsMilli + providerNanoUsdToMilliCredits(OPENAI_WEB_SEARCH_COST_NANO_USD), 32992);
});

test('every dynamic text workflow has explicit output bounds', () => {
  for (const [feature, limits] of Object.entries(DYNAMIC_TEXT_OUTPUT_LIMITS)) {
    assert.ok(limits.min > 0, feature);
    assert.ok(limits.max >= limits.min, feature);
  }
});

test('preflight error diagnostics пропускает только безопасные поля', () => {
  const diagnostics = getOpenAiPreflightErrorDiagnostics({ error: { type: 'invalid_request_error', code: 'bad_input', param: 'input[2].id', message: 'private user text' }, payload: 'secret' });
  assert.deepEqual(diagnostics, {
    providerErrorType: 'invalid_request_error',
    providerErrorCode: 'bad_input',
    providerErrorParam: 'input[2].id'
  });
  assert.equal(JSON.stringify(diagnostics).includes('private user text'), false);
  assert.equal(JSON.stringify(diagnostics).includes('secret'), false);
});
