import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpeechText, realtimeSpeechCostMilli, realtimeSpeechInputEvent, WebAudioError } from '../src/services/ai-web-audio.service.js';
import { calculateOpenAiTranscriptionUsageCost } from '../src/services/ai-usage-metering.service.js';

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
