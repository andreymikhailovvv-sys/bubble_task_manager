import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpeechText, realtimeSpeechCostMilli, realtimeSpeechInputEvent, WebAudioError } from '../src/services/ai-web-audio.service.js';
import { calculateOpenAiTranscriptionUsageCost } from '../src/services/ai-usage-metering.service.js';
import { createLiveVoiceTicket } from '../src/services/ai-live-voice.service.js';
import crypto from 'node:crypto';
import { SubscriptionAccessError, subscriptionAccessRepository } from '../src/services/subscription-access.service.js';

test('Web audio uses the current duration-billed transcription model', () => {
  const cost = calculateOpenAiTranscriptionUsageCost('gpt-transcribe', { type: 'duration', seconds: 60 });
  assert.equal(cost.estimatedCreditsMilli, 7500);
  assert.equal(cost.usageType, 'duration');
});

test('Narration charges text and audio at the Realtime mini rates', () => {
  assert.equal(realtimeSpeechCostMilli({
    input_tokens: 100, output_tokens: 100,
    input_token_details: { text_tokens: 100, audio_tokens: 0 },
    output_token_details: { text_tokens: 0, audio_tokens: 100 }
  }), 3434);
});

test('Narration never treats missing token breakdown as free', () => {
  assert.equal(realtimeSpeechCostMilli({ input_tokens: 100, output_tokens: 100 }), 5000);
});

test('Speech text is sanitized and bounded', () => {
  assert.equal(normalizeSpeechText('**Привет** [здесь](https://example.com)'), 'Привет здесь');
  assert.throws(() => normalizeSpeechText(''), WebAudioError);
  assert.throws(() => normalizeSpeechText('a'.repeat(2001)), WebAudioError);
});

test('Narration passes text to Realtime as a user conversation item', () => {
  const event = realtimeSpeechInputEvent('Прочитай этот ответ');
  assert.deepEqual(event, {
    type: 'conversation.item.create',
    item: { type: 'message', role: 'user',
      content: [{ type: 'input_text', text: 'Прочитай этот ответ' }] }
  });
});

test('Live voice tickets are one-time, short-lived and limited per user', async (t) => {
  const user = 'voice-ticket-test-' + crypto.randomUUID();
  // Stub only the database boundary; keep the production subscription gate active.
  const lookup = t.mock.method(subscriptionAccessRepository, 'findUser', async () => ({
    subscriptionPlan: 'pro', subscriptionExpiresAt: new Date(Date.now() + 86_400_000)
  }));
  const a = await createLiveVoiceTicket(user);
  const b = await createLiveVoiceTicket(user);
  const c = await createLiveVoiceTicket(user);
  assert.notEqual(a.ticket, b.ticket);
  assert.notEqual(b.ticket, c.ticket);
  assert.equal(a.maxSeconds, 300);
  assert.equal(a.expiresInSeconds, 30);
  await assert.rejects(() => createLiveVoiceTicket(user), /Слишком много запросов/);
  assert.equal(lookup.mock.callCount(), 4);
});

test('Live voice refuses missing, expired and lower-tier subscriptions before issuing a ticket', async (t) => {
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);
  const accounts = new Map([
    ['free', { subscriptionPlan: 'free', subscriptionExpiresAt: future }],
    ['start', { subscriptionPlan: 'start', subscriptionExpiresAt: future }],
    ['expired-pro', { subscriptionPlan: 'pro', subscriptionExpiresAt: past }],
    ['max', { subscriptionPlan: 'max', subscriptionExpiresAt: future }]
  ]);
  const lookup = t.mock.method(subscriptionAccessRepository, 'findUser', async (userId: string) => accounts.get(userId) ?? null);
  for (const userId of ['missing', 'free', 'start', 'expired-pro']) {
    await assert.rejects(() => createLiveVoiceTicket(userId), (error: unknown) =>
      error instanceof SubscriptionAccessError && error.status === 403 && error.requiredPlan === 'pro');
  }
  const allowed = await createLiveVoiceTicket('max');
  assert.equal(allowed.expiresInSeconds, 30);
  assert.equal(lookup.mock.callCount(), 5);
});

test('Realtime billing applies modality-specific cached input discounts', () => {
  // 100 total text + 100 audio input; 80 text / 60 audio cached.
  // Cost in nanoUSD: 20*600 + 80*60 + 40*10000 + 60*300 = 434800.
  assert.equal(realtimeSpeechCostMilli({
    input_tokens: 200, output_tokens: 0,
    input_token_details: {
      text_tokens: 100, audio_tokens: 100, cached_tokens: 140,
      cached_tokens_details: { text_tokens: 80, audio_tokens: 60 }
    }
  }), 725);
});

test('Unspecified cache modality is never guessed or discounted', () => {
  assert.equal(realtimeSpeechCostMilli({
    input_tokens: 100, output_tokens: 0,
    input_token_details: { text_tokens: 50, audio_tokens: 50, cached_tokens: 30 }
  }), 884);
});
