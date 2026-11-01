import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Mic, MicOff, PhoneOff, Volume2, X } from 'lucide-react';
import { api } from '../lib/api';
import { formatCreditsSpent } from '../lib/credits';

type Phase = 'connecting' | 'listening' | 'speaking' | 'thinking' | 'ended' | 'error';
type VoiceEvent = { type?: string; data?: string; text?: string; message?: string; creditsSpentMilli?: number };
const AUDIO_RATE = 24_000;

// The browser's AudioContext typically runs at 44.1 or 48 kHz. Realtime
// expects signed PCM16, mono at exactly 24 kHz.
function downsamplePcm(samples: Float32Array, sourceRate: number) {
  if (!Number.isFinite(sourceRate) || sourceRate < AUDIO_RATE) throw new Error('Неподдерживаемая частота аудио.');
  const length = Math.floor(samples.length * AUDIO_RATE / sourceRate);
  const pcm = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const sourceIndex = i * sourceRate / AUDIO_RATE;
    const left = Math.floor(sourceIndex);
    const fraction = sourceIndex - left;
    const value = samples[left] * (1 - fraction) + (samples[Math.min(samples.length - 1, left + 1)] || 0) * fraction;
    const limited = Math.max(-1, Math.min(1, value));
    pcm[i] = limited < 0 ? Math.round(limited * 32768) : Math.round(limited * 32767);
  }
  return new Uint8Array(pcm.buffer);
}

function encodeBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
  return btoa(binary);
}

function decodePcm(base64: string) {
  const raw = atob(base64);
  const count = Math.floor(raw.length / 2);
  const values = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const bits = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
    values[i] = (bits >= 32768 ? bits - 65536 : bits) / 32768;
  }
  return values;
}

export function LiveVoiceDialog({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('connecting');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0.06);
  const [caption, setCaption] = useState('');
  const [creditsSpentMilli, setCreditsSpentMilli] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const inputRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextPlaybackRef = useRef(0);
  const mutedRef = useRef(false);
  const stoppedRef = useRef(false);
  const startedAtRef = useRef(0);

  const clearPlayback = () => {
    sourcesRef.current.forEach(source => { try { source.stop(); } catch { /* finished */ } });
    sourcesRef.current.clear();
    nextPlaybackRef.current = contextRef.current?.currentTime ?? 0;
  };

  useEffect(() => {
    stoppedRef.current = false;
    let cancelled = false;
    const stopResources = () => {
      cancelled = true;
      stoppedRef.current = true;
      processorRef.current?.disconnect();
      inputRef.current?.disconnect();
      gainRef.current?.disconnect();
      processorRef.current = null;
      inputRef.current = null;
      gainRef.current = null;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      sourcesRef.current.forEach(source => { try { source.stop(); } catch { /* finished */ } });
      sourcesRef.current.clear();
      wsRef.current?.close();
      wsRef.current = null;
      void contextRef.current?.close().catch(() => undefined);
      contextRef.current = null;
    };
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext || !window.WebSocket) {
          throw new Error('Этот браузер не поддерживает живое общение.');
        }
        const context = new AudioContext();
        contextRef.current = context;
        await context.resume();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        const { ticket } = await api.startLiveVoice();
        if (cancelled) return;
        const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${scheme}//${location.host}/api/ai/audio/live?ticket=${encodeURIComponent(ticket)}`);
        wsRef.current = ws;
        ws.onopen = () => { /* Wait for the authenticated upstream session.updated event. */ };
        ws.onmessage = event => {
          if (cancelled) return;
          let payload: VoiceEvent;
          try { payload = JSON.parse(String(event.data)) as VoiceEvent; } catch { return; }
          if (payload.type === 'ready') {
            startedAtRef.current = Date.now();
            setPhase('listening');
            const input = context.createMediaStreamSource(stream);
            const processor = context.createScriptProcessor(4096, 1, 1);
            const silent = context.createGain();
            silent.gain.value = 0;
            input.connect(processor);
            processor.connect(silent);
            silent.connect(context.destination);
            inputRef.current = input;
            processorRef.current = processor;
            gainRef.current = silent;
            processor.onaudioprocess = event => {
              if (cancelled || stoppedRef.current) return;
              const samples = event.inputBuffer.getChannelData(0);
              let total = 0;
              for (let i = 0; i < samples.length; i += 8) total += samples[i] * samples[i];
              const rms = Math.sqrt(total / (samples.length / 8));
              setLevel(Math.max(.06, Math.min(1, rms * 5)));
              if (ws.readyState !== WebSocket.OPEN || mutedRef.current || ws.bufferedAmount > 300_000) return;
              try { ws.send(JSON.stringify({ type: 'audio', audio: encodeBase64(downsamplePcm(samples, context.sampleRate)) })); }
              catch { /* transient sample failure */ }
            };
          }
          if (payload.type === 'speech_started') {
            clearPlayback();
            setCaption('');
            setPhase('listening');
          }
          if (payload.type === 'thinking') setPhase('thinking');
          if (payload.type === 'audio' && typeof payload.data === 'string') {
            try {
              const pcm = decodePcm(payload.data);
              if (!pcm.length) return;
              const buffer = context.createBuffer(1, pcm.length, AUDIO_RATE);
              buffer.copyToChannel(pcm, 0);
              const source = context.createBufferSource();
              source.buffer = buffer;
              source.connect(context.destination);
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setPhase(previous => previous === 'speaking' ? 'listening' : previous);
              };
              sourcesRef.current.add(source);
              const at = Math.max(context.currentTime + .045, nextPlaybackRef.current);
              source.start(at);
              nextPlaybackRef.current = at + buffer.duration;
              setPhase('speaking');
            } catch { setError('Не удалось обработать фрагмент речи.'); }
          }
          if (payload.type === 'transcript' && typeof payload.text === 'string') {
            setCaption(previous => (previous + payload.text).slice(-400));
          }
          if (payload.type === 'usage' && typeof payload.creditsSpentMilli === 'number') {
            setCreditsSpentMilli(payload.creditsSpentMilli);
          }
          if (payload.type === 'response_done') {
            const until = nextPlaybackRef.current - context.currentTime;
            // Keep the speaking UI while the last queued audio frames play.
            if (until <= 0) setPhase('listening');
          }
          if (payload.type === 'finished') {
            if (typeof payload.creditsSpentMilli === 'number') setCreditsSpentMilli(payload.creditsSpentMilli);
            setPhase('ended');
            processorRef.current?.disconnect();
            streamRef.current?.getTracks().forEach(track => track.stop());
            clearPlayback();
            ws.close();
          }
          if (payload.type === 'notice' && payload.message) setError(payload.message);
          if (payload.type === 'error') {
            setError(payload.message || 'Ошибка голосового соединения.');
            setPhase('error');
          }
        };
        ws.onerror = () => { if (!cancelled) { setError('Не удалось подключиться к голосовому серверу.'); setPhase('error'); } };
        ws.onclose = () => {
          if (!cancelled) setPhase(previous => previous === 'ended' || previous === 'error' ? previous : 'ended');
        };
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error && cause.name === 'NotAllowedError'
            ? 'Разрешите микрофон в Telegram или браузере.' : cause instanceof Error ? cause.message : 'Не удалось начать диалог.');
          setPhase('error');
        }
      }
    };
    void start();
    return stopResources;
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (startedAtRef.current) setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 500);
    return () => window.clearInterval(interval);
  }, []);

  const toggleMuted = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
  };

  const finish = () => {
    if (phase === 'ended' || phase === 'error') { onClose(); return; }
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(track => track.stop());
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'end' }));
      setPhase('thinking');
    } else onClose();
  };

  const phaseText: Record<Phase, string> = {
    connecting: 'Соединяем с голосовым ИИ…',
    listening: muted ? 'Микрофон выключен' : 'Слушаю вас',
    speaking: 'ИИ говорит',
    thinking: 'ИИ думает…',
    ended: 'Разговор завершён',
    error: 'Ошибка соединения'
  };

  return createPortal(<div className="live-voice-backdrop" role="presentation">
    <section className="live-voice-dialog dialog-surface" role="dialog" aria-modal="true" aria-label="Живое общение с ИИ">
      <header className="live-voice-header">
        <span>Живой диалог</span>
        <button type="button" onClick={onClose} aria-label="Закрыть голосовой диалог"><X size={19}/></button>
      </header>
      <div className="live-voice-center">
        <div className={`live-voice-orb ${phase === 'speaking' ? 'is-speaking' : ''} ${phase === 'listening' ? 'is-listening' : ''}`}
          style={{ '--voice-level': level } as React.CSSProperties}>
          <span className="live-voice-orb-core">{phase === 'connecting' ? <Loader2 size={31} className="ai-speech-loading-spin" /> : <Volume2 size={30}/>}</span>
        </div>
        <strong>{phaseText[phase]}</strong>
        <p className="live-voice-caption" aria-live="polite">{caption || 'Говорите естественно. ИИ ответит вслух после паузы.'}</p>
        <div className="live-voice-meta">
          <span>{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')} / 02:00</span>
          <span>Голос: Marin</span>
        </div>
        <div className="live-voice-credits">Озвучивание и разговор: {creditsSpentMilli ? formatCreditsSpent(creditsSpentMilli) : '0 кредитов'}</div>
        {error ? <div role="alert" className="live-voice-error">{error}</div> : null}
      </div>
      <footer className="live-voice-footer">
        <button type="button" className={muted ? 'is-muted' : ''} onClick={toggleMuted} disabled={phase === 'error' || phase === 'ended'} aria-label={muted ? 'Включить микрофон' : 'Выключить микрофон'}>
          {muted ? <MicOff size={19}/> : <Mic size={19}/>}
        </button>
        <button type="button" className="live-voice-end" onClick={finish}>
          <PhoneOff size={18}/>{phase === 'ended' || phase === 'error' ? 'Закрыть' : 'Завершить'}
        </button>
      </footer>
      <p className="live-voice-note">Режим работает до 2 минут. Кредиты учитываются по использованию голосовой модели; итог показывается при завершении.</p>
    </section>
  </div>, document.body);
}
