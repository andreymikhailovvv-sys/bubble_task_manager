import assert from 'node:assert/strict';
import test from 'node:test';
import { createCleanOpenAiResponsesPayload, DYNAMIC_TEXT_OUTPUT_LIMITS, getOpenAiPreflightErrorDiagnostics, isDynamicTextBillingEnabled } from '../src/services/dynamic-responses-billing.service.js';

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
