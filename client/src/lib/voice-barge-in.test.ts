import test from 'node:test';
import assert from 'node:assert/strict';
import { createBargeInDetector, estimateEchoCorrelation } from './voice-barge-in';

test('speaker echo never interrupts while playback correlation stays high', () => {
  const gate = createBargeInDetector();
  let triggered = false;
  for (let i = 1; i < 40; i++) {
    triggered ||= gate.observe({ microphoneRms: 0.08, echoCorrelation: 0.94,
      playbackActive: true, muted: false, nowMs: i * 85 });
  }
  assert.equal(triggered, false);
});

test('sustained near-end speech interrupts once after echo calibration', () => {
  const gate = createBargeInDetector();
  for (let i = 1; i < 8; i++) {
    assert.equal(gate.observe({ microphoneRms: 0.04, echoCorrelation: 0.9,
      playbackActive: true, muted: false, nowMs: i * 85 }), false);
  }
  let interrupted = false;
  for (let i = 8; i < 16; i++) {
    interrupted ||= gate.observe({ microphoneRms: 0.055, echoCorrelation: 0.18,
      playbackActive: true, muted: false, nowMs: i * 85 });
  }
  assert.equal(interrupted, true);
  assert.equal(gate.observe({ microphoneRms: 0.09, echoCorrelation: 0.1,
    playbackActive: true, muted: false, nowMs: 1500 }), false);
});

test('muting and stopping playback reset interruption detection', () => {
  const gate = createBargeInDetector();
  assert.equal(gate.observe({ microphoneRms: 0.2, echoCorrelation: 0,
    playbackActive: true, muted: true, nowMs: 100 }), false);
  assert.equal(gate.observe({ microphoneRms: 0.2, echoCorrelation: 0,
    playbackActive: false, muted: false, nowMs: 200 }), false);
});

test('reference correlation distinguishes delayed speaker echo from unrelated voice', () => {
  const rate = 24000, delay = 0.06, now = 2;
  const output = (time: number) => Math.sin(time * 2 * Math.PI * 421) * .4
    + Math.sin(time * 2 * Math.PI * 587) * .2;
  const frame = new Float32Array(2048);
  for (let i = 0; i < frame.length; i++) frame[i] = output(now - frame.length / rate + i / rate - delay);
  assert.ok(estimateEchoCorrelation(frame, rate, now, output) > 0.5);
  const silent = new Float32Array(2048);
  assert.equal(estimateEchoCorrelation(silent, rate, now, output), 0);
});
