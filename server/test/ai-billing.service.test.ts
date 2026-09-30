import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateOpenAiBilling, normalizeOpenAiUsage } from '../src/services/ai-billing.service.js';
import { getOpenAiPricing } from '../src/config/openai-pricing.js';

test('cached and cache-write tokens are not charged twice', () => {
  const billing = calculateOpenAiBilling('gpt-6-luna', {
    input_tokens: 1_000_000,
    input_tokens_details: { cached_tokens: 200_000, cache_write_tokens: 100_000 },
    output_tokens: 100_000,
    output_tokens_details: { reasoning_tokens: 50_000 }
  });
  assert.deepEqual(normalizeOpenAiUsage({ input_tokens: 10, input_tokens_details: { cached_tokens: 7, cache_write_tokens: 8 } }), {
    inputTokens: 10, cachedInputTokens: 7, cacheWriteTokens: 3, outputTokens: 0, reasoningTokens: 0
  });
  assert.equal(billing.providerCostNanoUsd, 244_000_000n);
  assert.equal(billing.creditsSpentMilli, 406_667);
});

test('long context rates apply only above 272000 tokens', () => {
  assert.equal(getOpenAiPricing('gpt-6-sol', 272_000).inputNanoUsdPerMillion, 2_000_000_000n);
  assert.equal(getOpenAiPricing('gpt-6-sol', 272_001).inputNanoUsdPerMillion, 4_000_000_000n);
});

test('unknown models fail closed', () => {
  assert.throws(() => calculateOpenAiBilling('unknown-expensive-model', { input_tokens: 1 }), /pricing is not configured/);
});
