import assert from 'node:assert/strict';
import test from 'node:test';
import { requestLiveVoiceMediaSession } from './live-voice-audio-session';

test('iOS Telegram requests media playback and restores the previous session', () => {
  const session = { type: 'auto' };
  const restore = requestLiveVoiceMediaSession({
    session, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', telegram: true
  });
  assert.equal(session.type, 'playback');
  restore();
  assert.equal(session.type, 'auto');
});

test('Android Telegram and ordinary iOS browser do not change audio policy', () => {
  for (const [userAgent, telegram] of [
    ['Mozilla/5.0 (Linux; Android 15) Telegram', true],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', false]
  ] as const) {
    const session = { type: 'auto' };
    requestLiveVoiceMediaSession({ session, userAgent, telegram })();
    assert.equal(session.type, 'auto');
  }
});

test('unsupported AudioSession and rejected changes fall back safely', () => {
  assert.doesNotThrow(() => requestLiveVoiceMediaSession({
    session: null, userAgent: 'iPhone', telegram: true
  })());
  const session = {
    get type() { return 'auto'; },
    set type(_value: string) { throw new Error('Audio mode locked by host'); }
  };
  assert.doesNotThrow(() => requestLiveVoiceMediaSession({
    session, userAgent: 'iPhone', telegram: true
  })());
});

test('closing the voice session does not undo another owner audio mode', () => {
  const session = { type: 'auto' };
  const restore = requestLiveVoiceMediaSession({
    session, userAgent: 'iPhone', telegram: true
  });
  session.type = 'play-and-record';
  restore();
  assert.equal(session.type, 'play-and-record');
});
