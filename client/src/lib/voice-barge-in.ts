/**
 * Barge-in is detected locally while AI audio is playing. The browser's AEC
 * remains the first line of defence; this gate requires sustained, clearly
 * stronger near-end activity than the acoustic echo baseline. We deliberately
 * never forward uncertain echo frames to server VAD.
 */
export type BargeInSample = { microphoneRms: number; echoCorrelation: number; playbackActive: boolean; muted: boolean; nowMs: number };
export type BargeInDetector = { observe: (sample: BargeInSample) => boolean; reset: () => void };

export function createBargeInDetector(): BargeInDetector {
  let playbackSince = 0;
  let echoFloor = 0.008;
  let candidateSince = 0;
  let lastAt = 0;
  let interrupted = false;
  return {
    reset() {
      playbackSince = 0; echoFloor = 0.008; candidateSince = 0; lastAt = 0; interrupted = false;
    },
    observe({ microphoneRms: rms, echoCorrelation: corr, playbackActive, muted, nowMs }: BargeInSample) {
      if (!playbackActive || muted) {
        playbackSince = 0; candidateSince = 0; interrupted = false; echoFloor = 0.008;
        return false;
      }
      if (interrupted) return false;
      if (!playbackSince) playbackSince = nowMs;
      // The start of the output can be unusually loud and must set a baseline.
      if (nowMs - playbackSince < 280) {
        echoFloor = Math.max(echoFloor * .95, rms);
        candidateSince = 0;
        return false;
      }
      // Correlated signal is almost certainly the model leaking into the mic.
      // AEC can erase that reference, leaving a near-end voice uncorrelated.
      const weakEcho = corr < 0.50;
      const strongVoice = rms >= Math.max(0.024, echoFloor * (weakEcho ? 1.85 : 3.1));
      const nearEnd = strongVoice && (weakEcho || rms > echoFloor * 3.1);
      if (!nearEnd) {
        candidateSince = 0;
        // Follow slow output-volume changes, not short user speech spikes.
        echoFloor = Math.max(.008, echoFloor * .985 + Math.min(rms, echoFloor * 1.25) * .015);
        return false;
      }
      if (!candidateSince || nowMs - lastAt > 180) candidateSince = nowMs;
      lastAt = nowMs;
      if (nowMs - candidateSince < 125) return false;
      interrupted = true;
      return true;
    }
  };
}

/** Normalized similarity of mic audio and speaker playback at multiple
 * acoustic delays. A high value indicates speaker echo, not user speech.
 * Call only during playback, and use a sparse sample to keep ScriptProcessor
 * work well below the 85 ms audio frame budget. */
export function estimateEchoCorrelation(
  samples: Float32Array, sourceRate: number, currentTime: number,
  reference: (timeSeconds: number) => number
): number {
  if (!samples.length || sourceRate <= 0) return 0;
  const stride = Math.max(1, Math.round(sourceRate / 2000));
  const frameStart = currentTime - samples.length / sourceRate;
  let micPower = 0;
  for (let i = 0; i < samples.length; i += stride) micPower += samples[i] * samples[i];
  if (micPower < .001) return 0;
  let best = 0;
  for (let delayMs = 35; delayMs <= 260; delayMs += 25) {
    let cross = 0, outputPower = 0;
    for (let i = 0; i < samples.length; i += stride) {
      const output = reference(frameStart + i / sourceRate - delayMs / 1000);
      cross += samples[i] * output;
      outputPower += output * output;
    }
    if (outputPower > .001) best = Math.max(best, Math.abs(cross) / Math.sqrt(micPower * outputPower));
  }
  return Math.min(1, best);
}
