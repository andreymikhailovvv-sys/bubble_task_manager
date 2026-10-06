import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { calculateOpenAiTranscriptionUsageCost } from '../src/services/ai-usage-metering.service.js';

test('gpt-4o-mini-transcribe тарифицируется по фактическим input/output tokens', () => {
  const cost = calculateOpenAiTranscriptionUsageCost('gpt-4o-mini-transcribe', {
    type: 'tokens',
    input_tokens: 1000,
    output_tokens: 100,
    total_tokens: 1100,
    input_token_details: { audio_tokens: 1000, text_tokens: 0 }
  });
  assert.equal(cost.usageType, 'tokens');
  assert.equal(cost.inputTokens, 1000);
  assert.equal(cost.outputTokens, 100);
  assert.equal(cost.providerCostNanoUsd, 1_750_000n);
  assert.equal(cost.estimatedCreditsMilli, 2917);
});

test('duration based transcription uses the same provider-cost to credits conversion', () => {
  const cost = calculateOpenAiTranscriptionUsageCost('gpt-transcribe', {
    type: 'duration',
    seconds: 60
  });
  assert.equal(cost.usageType, 'duration');
  assert.equal(cost.durationSeconds, 60);
  assert.equal(cost.providerCostNanoUsd, 4_500_000n);
  assert.equal(cost.estimatedCreditsMilli, 7500);
});

test('unknown transcription pricing is never silently treated as free', () => {
  const cost = calculateOpenAiTranscriptionUsageCost('unknown-transcriber', {
    type: 'tokens',
    input_tokens: 100,
    output_tokens: 10,
    total_tokens: 110
  });
  assert.equal(cost.providerCostNanoUsd, null);
  assert.equal(cost.estimatedCreditsMilli, null);
});

test('Telegram voice flow sums transcription and AI billing and prints one total', async () => {
  const source = await readFile(new URL('../src/services/telegram.service.ts', import.meta.url), 'utf8');
  const start = source.indexOf('if (isVoiceMessage)');
  const end = source.indexOf('if (descriptionText)', start);
  const flow = source.slice(start, end);

  assert.match(flow, /transcribeAudio\(\{[\s\S]*userId: session\.userId/);
  assert.match(flow, /transcription\.billing\.creditsSpentMilli \+ \(result\.billing\?\.creditsSpentMilli \?\? 0\)/);
  assert.match(flow, /Потрачено кредитов:/);
  assert.match(flow, /formatCreditsSpent\(totalCreditsSpentMilli\)/);
});

test('audio transcription records usage and debits the shared AI wallet', async () => {
  const source = await readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  const start = source.indexOf('transcribeAudio: async');
  const end = source.indexOf('listTaskDialog:', start);
  const method = source.slice(start, end);

  assert.match(method, /payload\.usage/);
  assert.match(method, /recordOpenAiTranscriptionUsage/);
  assert.match(method, /reserveAiCreditsMilli\(input\.userId, metering\.estimatedCreditsMilli\)/);
  assert.match(method, /creditsSpentMilli: metering\.estimatedCreditsMilli/);
});

test('legacy AI chat reports the fixed credits it already charges', async () => {
  const source = await readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  const start = source.indexOf('async askAiChat(');
  const end = source.indexOf('async parseRecurrence(', start);
  const method = source.slice(start, end);

  assert.match(method, /mode: 'legacy' as const/);
  assert.match(method, /creditsSpentMilli: creditsToMilli\(resolveModelCredits\(model\)\)/);
});
