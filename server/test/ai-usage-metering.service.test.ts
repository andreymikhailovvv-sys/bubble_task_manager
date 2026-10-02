import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateOpenAiUsageCost,
  calculateMaximumRequestCreditsMilli,
  normalizeOpenAiUsage,
  recordOpenAiUsageShadow
} from '../src/services/ai-usage-metering.service.js';
import { OPENAI_WEB_SEARCH_COST_NANO_USD } from '../src/config/openai-pricing.js';
import { providerNanoUsdToMilliCredits } from '../src/services/ai-usage-metering.service.js';

test('web search fixed price is exactly 16667 millicredits', () => {
  assert.equal(providerNanoUsdToMilliCredits(OPENAI_WEB_SEARCH_COST_NANO_USD), 16667);
});

test('maximum reservation использует дорогую cache-write ставку и output budget', () => {
  const result = calculateMaximumRequestCreditsMilli({ model: 'gpt-6-luna', inputTokens: 1_000, maxOutputTokens: 1_000 });
  assert.deepEqual(result, { inputCreditsMilli: 209, outputCreditsMilli: 834, totalCreditsMilli: 1043, outputNanoUsdPerMillion: 500_000_000n });
});

test('считает обычные input и output токены в nanoUSD и millicredits', () => {
  const result = calculateOpenAiUsageCost('gpt-6-luna', { input_tokens: 1_000, output_tokens: 100 });
  assert.equal(result.providerCostNanoUsd, 150_000n);
  assert.equal(result.estimatedCreditsMilli, 250);
});

test('выделяет cached input из общего input без двойного учёта', () => {
  const result = calculateOpenAiUsageCost('gpt-6-luna', {
    input_tokens: 1_000,
    input_tokens_details: { cached_tokens: 200 }
  });
  assert.equal(result.ordinaryInputTokens, 800);
  assert.equal(result.providerCostNanoUsd, 82_000n);
});

test('выделяет cache write из общего input без двойного учёта', () => {
  const result = calculateOpenAiUsageCost('gpt-6-luna', {
    input_tokens: 1_000,
    input_tokens_details: { cache_write_tokens: 100 }
  });
  assert.equal(result.ordinaryInputTokens, 900);
  assert.equal(result.providerCostNanoUsd, 102_500n);
});

test('одновременно исключает cached и cache-write токены из ordinary input', () => {
  const result = normalizeOpenAiUsage({
    input_tokens: 1_000,
    input_tokens_details: { cached_tokens: 200, cache_write_tokens: 300 }
  });
  assert.equal(result.ordinaryInputTokens, 500);
});

test('не прибавляет reasoning tokens поверх output tokens', () => {
  const withReasoning = calculateOpenAiUsageCost('gpt-6-luna', {
    output_tokens: 100,
    output_tokens_details: { reasoning_tokens: 80 }
  });
  const withoutReasoning = calculateOpenAiUsageCost('gpt-6-luna', { output_tokens: 100 });
  assert.equal(withReasoning.reasoningTokens, 80);
  assert.equal(withReasoning.providerCostNanoUsd, withoutReasoning.providerCostNanoUsd);
});

for (const [model, expectedNanoUsd] of [
  ['gpt-6-luna', 600_000n],
  ['gpt-6-sol', 12_000_000n],
  ['gpt-5.4-mini', 5_250_000n],
  ['gpt-5-mini', 2_250_000n],
  ['gpt-5-nano', 450_000n]
] as const) {
  test(`применяет Standard API pricing для ${model}`, () => {
    const result = calculateOpenAiUsageCost(model, { input_tokens: 1_000, output_tokens: 1_000 });
    assert.equal(result.providerCostNanoUsd, expectedNanoUsd);
  });
}

test('применяет long-context pricing GPT-6 только выше 272000 input tokens', () => {
  const short = calculateOpenAiUsageCost('gpt-6-sol', { input_tokens: 272_000 });
  const long = calculateOpenAiUsageCost('gpt-6-sol', { input_tokens: 272_001 });
  assert.equal(short.providerCostNanoUsd, 544_000_000n);
  assert.equal(long.providerCostNanoUsd, 1_088_004_000n);
});

test('округляет перевод nanoUSD в millicredits вверх', () => {
  const result = calculateOpenAiUsageCost('gpt-5-nano', { input_tokens: 1 });
  assert.equal(result.providerCostNanoUsd, 50n);
  assert.equal(result.estimatedCreditsMilli, 1);
});

test('для модели без cache-write тарифа использует input rate и отмечает fallback', () => {
  const result = calculateOpenAiUsageCost('gpt-5-mini', {
    input_tokens: 10,
    input_tokens_details: { cache_write_tokens: 10 }
  });
  assert.equal(result.providerCostNanoUsd, 2_500n);
  assert.equal(result.pricingFallback, true);
});

test('неизвестная модель сохраняет usage с пустой стоимостью', async () => {
  let data: Record<string, unknown> | undefined;
  await recordOpenAiUsageShadow({
    userId: 'user-1', requestId: 'request-1', feature: 'task_chat', model: 'unknown-model',
    usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15 }
  }, { create: async (args) => { data = args.data; } });
  assert.equal(data?.inputTokens, 12);
  assert.equal(data?.providerCostNanoUsd, null);
  assert.equal(data?.estimatedCreditsMilli, null);
});

test('сохраняет идентификатор действия и номер provider-вызова', async () => {
  let data: Record<string, unknown> | undefined;
  await recordOpenAiUsageShadow({
    userId: 'user-1', actionId: 'action-1', requestId: 'action-1:planner:2',
    providerCallIndex: 2, feature: 'ai_chat_planner', model: 'gpt-5.4-mini',
    usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15 }
  }, { create: async (args) => { data = args.data; } });
  assert.equal(data?.actionId, 'action-1');
  assert.equal(data?.requestId, 'action-1:planner:2');
  assert.equal(data?.providerCallIndex, 2);
});

test('отсутствующий usage не создаёт событие и не ломает flow', async () => {
  let calls = 0;
  await recordOpenAiUsageShadow({
    userId: 'user-1', requestId: 'request-1', feature: 'task_chat', model: 'gpt-6-luna'
  }, { create: async () => { calls += 1; } });
  assert.equal(calls, 0);
});

test('ошибка записи telemetry не пробрасывается в AI flow', async () => {
  await assert.doesNotReject(recordOpenAiUsageShadow({
    userId: 'user-1', requestId: 'request-1', feature: 'task_chat', model: 'gpt-6-luna',
    usage: { input_tokens: 10, output_tokens: 5 }
  }, { create: async () => { throw new Error('database unavailable'); } }));
});

test('feature flag полностью отключает запись telemetry', async () => {
  const previous = process.env.AI_USAGE_SHADOW_ENABLED;
  process.env.AI_USAGE_SHADOW_ENABLED = 'false';
  let calls = 0;
  try {
    await recordOpenAiUsageShadow({
      userId: 'user-1', requestId: 'request-1', feature: 'task_chat', model: 'gpt-6-luna',
      usage: { input_tokens: 10 }
    }, { create: async () => { calls += 1; } });
    assert.equal(calls, 0);
  } finally {
    if (previous === undefined) delete process.env.AI_USAGE_SHADOW_ENABLED;
    else process.env.AI_USAGE_SHADOW_ENABLED = previous;
  }
});
