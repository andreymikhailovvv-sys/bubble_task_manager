import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, PhoneOff, Volume2, X } from 'lucide-react';
import { api, type AiChatResult, type TaskAssistantResult } from '../lib/api';
import type { AiChatModel } from '../lib/types';
import { formatCreditsSpent } from '../lib/credits';

export type LiveVoiceContext =
  | { type: 'task'; taskId: string; timeZone?: string; model?: AiChatModel }
  | { type: 'chat'; projectId?: string; chatId: string; history?: Array<{ id: string; role: 'user' | 'assistant'; content: string }>; timeZone?: string; projectTitle?: string; chatTitle?: string; model?: AiChatModel };

export type LiveVoiceMessage = { role: 'user' | 'assistant'; id: string; text: string };
export type LiveVoiceToolCompletion = { question: string; kind: 'task' | 'chat'; result: AiChatResult | TaskAssistantResult };

type Phase = 'connecting' | 'listening' | 'speaking' | 'thinking' | 'ended' | 'error';
type VoiceEvent = { type?: string; data?: string; text?: string; id?: string; callId?: string; question?: string; message?: string; creditsSpentMilli?: number };
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

export function LiveVoiceDialog({ onClose, audioContext, liveContext, onLiveMessage, onLiveToolResult }: {
  onClose: () => void; audioContext: AudioContext | null; liveContext?: LiveVoiceContext;
  onLiveMessage?: (item: LiveVoiceMessage) => void;
  onLiveToolResult?: (result: LiveVoiceToolCompletion) => void;
}) {
  const [phase, setPhase] = useState<Phase>('connecting');
  const processingToolRef = useRef(false);
  const toolQueueRef = useRef<Array<{ question: string; callId: string; ws: WebSocket }>>([]);
  const dialogHistoryRef = useRef(liveContext?.type === 'chat' ? [...(liveContext.history ?? [])] : []);
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
  // Server VAD hears everything sent through the socket, including echo from
  // our own speaker. Hold the mic uplink until the response has FINISHED PLAYING.
  const uplinkPausedRef = useRef(false);
  const responseDoneRef = useRef(false);
  const stopResourcesRef = useRef<() => void>(() => {});
  const liveContextRef = useRef(liveContext);
  const onLiveMessageRef = useRef(onLiveMessage);
  const onLiveToolResultRef = useRef(onLiveToolResult);
  liveContextRef.current = liveContext;
  onLiveMessageRef.current = onLiveMessage;
  onLiveToolResultRef.current = onLiveToolResult;

  const resumeListeningAfterPlayback = () => {
    if (stoppedRef.current || !responseDoneRef.current || processingToolRef.current || sourcesRef.current.size > 0) return;
    responseDoneRef.current = false;
    uplinkPausedRef.current = false;
    setPhase('listening');
  };

  const clearPlayback = () => {
    sourcesRef.current.forEach(source => { try { source.stop(); } catch { /* finished */ } });
    sourcesRef.current.clear();
    nextPlaybackRef.current = contextRef.current?.currentTime ?? 0;
  };

  const handleToolRequest = async (question: string, callId: string, ws: WebSocket) => {
    if (stoppedRef.current || !liveContextRef.current || ws.readyState !== WebSocket.OPEN) return;
    if (processingToolRef.current) {
      // Realtime can return more than one function call in a response. Losing
      // the second call would leave the server waiting forever for its result.
      if (toolQueueRef.current.length < 3) toolQueueRef.current.push({ question, callId, ws });
      else ws.send(JSON.stringify({ type: 'tool_result', callId, answer: 'Слишком много одновременных запросов к инструментам.' }));
      return;
    }
    processingToolRef.current = true;
    uplinkPausedRef.current = true;
    responseDoneRef.current = false;
    setPhase('thinking');
    try {
      const scope = liveContextRef.current!;
      const result = scope.type === 'task'
        ? await api.askTaskAssistantStreaming(scope.taskId, {
          clientRequestId: crypto.randomUUID(), question, userMessage: question,
          model: scope.model, clientSurface: navigator.userAgent.includes('Telegram') ? 'miniapp' : 'web'
        })
        : await api.askAiChatStreaming({
          clientRequestId: crypto.randomUUID(), question,
          history: dialogHistoryRef.current.filter((entry, index, items) => !(index === items.length - 1 && entry.role === 'user' && entry.content.trim() === question.trim())), model: scope.model,
          projectId: scope.type === 'chat' ? scope.projectId : undefined, chatId: scope.type === 'chat' ? scope.chatId : undefined,
          projectTitle: scope.type === 'chat' ? scope.projectTitle : undefined, chatTitle: scope.type === 'chat' ? scope.chatTitle : undefined,
          clientSurface: navigator.userAgent.includes('Telegram') ? 'miniapp' : 'web'
        });
      if (!stoppedRef.current) {
        onLiveToolResultRef.current?.({ kind: scope.type, question, result });
        if (scope.type === 'chat') dialogHistoryRef.current.push({ id: crypto.randomUUID(), role: 'assistant', content: result.answer });
        if (ws.readyState === WebSocket.OPEN) {
          // Realtime must finish narrating the delegated result before mic uplink resumes.
          responseDoneRef.current = false;
          ws.send(JSON.stringify({ type: 'tool_result', callId, answer: result.answer }));
        }
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Ошибка инструмента.';
      if (!stoppedRef.current) {
        setError(message);
        if (ws.readyState === WebSocket.OPEN) {
          responseDoneRef.current = false;
          ws.send(JSON.stringify({ type: 'tool_result', callId, answer: 'Не удалось выполнить действие: ' + message }));
        }
      }
    } finally {
      processingToolRef.current = false;
      if (!stoppedRef.current) {
        const next = toolQueueRef.current.shift();
        if (next) void handleToolRequest(next.question, next.callId, next.ws);
      }
    }
  };

  useEffect(() => {
    stoppedRef.current = false;
    let cancelled = false;
    const stopResources = () => {
      if (cancelled) return;
      cancelled = true;
      stoppedRef.current = true;
      toolQueueRef.current = [];
      uplinkPausedRef.current = true;
      responseDoneRef.current = false;
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
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'end' })); } catch { /* socket closed */ }
      }
      ws?.close();
      wsRef.current = null;
      void contextRef.current?.close().catch(() => undefined);
      contextRef.current = null;
    };
    stopResourcesRef.current = stopResources;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext || !window.WebSocket) {
          throw new Error('Этот браузер не поддерживает живое общение.');
        }
        const context = audioContext ?? new AudioContext();
        contextRef.current = context;
        await context.resume();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        const { ticket } = await api.startLiveVoice(liveContext ? { ...liveContext, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : undefined);
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
            // Duplicate session.updated must not create several microphone processors.
            if (processorRef.current || stoppedRef.current) return;
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
              if (ws.readyState !== WebSocket.OPEN || mutedRef.current || uplinkPausedRef.current || ws.bufferedAmount > 300_000) return;
              try { ws.send(JSON.stringify({ type: 'audio', audio: encodeBase64(downsamplePcm(samples, context.sampleRate)) })); }
              catch { /* transient sample failure */ }
            };
          }
          if (payload.type === 'user_message' && typeof payload.text === 'string') {
            const id = payload.id || crypto.randomUUID();
            if (liveContextRef.current?.type === 'chat') dialogHistoryRef.current.push({ id, role: 'user', content: payload.text });
            onLiveMessageRef.current?.({ role: 'user', id, text: payload.text });
          }
          if (payload.type === 'assistant_message' && typeof payload.text === 'string') {
            const id = payload.id || crypto.randomUUID();
            if (liveContextRef.current?.type === 'chat') dialogHistoryRef.current.push({ id, role: 'assistant', content: payload.text });
            onLiveMessageRef.current?.({ role: 'assistant', id, text: payload.text });
          }
          if (payload.type === 'tool_request' && typeof payload.question === 'string' && typeof payload.callId === 'string') {
            void handleToolRequest(payload.question, payload.callId, ws);
          }
          if (payload.type === 'speech_started' && !uplinkPausedRef.current) {
            clearPlayback();
            setCaption('');
            setPhase('listening');
          }
          if (payload.type === 'thinking') {
            // Do not send speaker echo or follow-up room noise as a new user turn.
            uplinkPausedRef.current = true;
            responseDoneRef.current = false;
            setPhase('thinking');
          }
          if (payload.type === 'audio' && typeof payload.data === 'string') {
            uplinkPausedRef.current = true;
            responseDoneRef.current = false;
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
                // The final chunk can finish after response.done. Do not reopen
                // mic between queued chunks or while a tool is still running.
                if (sourcesRef.current.size === 0) resumeListeningAfterPlayback();
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
            responseDoneRef.current = true;
            resumeListeningAfterPlayback();
          }
          if (payload.type === 'finished') {
            if (typeof payload.creditsSpentMilli === 'number') setCreditsSpentMilli(payload.creditsSpentMilli);
            stopResources();
            onClose();
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
      if (!stoppedRef.current && startedAtRef.current) setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 500);
    return () => window.clearInterval(interval);
  }, []);

  const toggleMuted = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    streamRef.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
    setMuted(next);
  };

  const finish = () => {
    // A hang-up is local and synchronous. Never wait for the upstream model,
    // final billing, another WebSocket event or playback to finish.
    stopResourcesRef.current();
    onClose();
  };

  const phaseText: Record<Phase, string> = {
    connecting: 'Соединяем с голосовым ИИ…',
    listening: muted ? 'Микрофон выключен' : 'Слушаю вас',
    speaking: 'ИИ говорит',
    thinking: 'ИИ думает…',
    ended: 'Разговор завершён',
    error: 'Ошибка соединения'
  };

  return <section className="live-voice-inline dialog-surface" role="region" aria-label="Живое общение с ИИ">
    <div className="live-voice-inline-row">
      <span className={`live-voice-inline-orb ${phase === 'speaking' ? 'is-speaking' : ''}`}
        style={{ '--voice-level': level } as React.CSSProperties} aria-hidden="true">
        {phase === 'connecting' ? <Loader2 size={16} className="ai-speech-loading-spin"/> : <Volume2 size={16}/>}
      </span>
      <div className="live-voice-inline-status">
        <strong>{phaseText[phase]}</strong>
        <small title="До 450 кредитов временно резервируются. После завершения списывается фактический расход, остаток возвращается.">{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')} · {creditsSpentMilli ? formatCreditsSpent(creditsSpentMilli) : '0 кредитов'}</small>
      </div>
      <button className="live-voice-inline-button" type="button" onClick={toggleMuted} disabled={phase === 'ended' || phase === 'error'}
        title={muted ? 'Включить микрофон' : 'Отключить микрофон'} aria-label={muted ? 'Включить микрофон' : 'Отключить микрофон'}>
        {muted ? <MicOff size={17}/> : <Mic size={17}/>}
      </button>
      <button className="live-voice-inline-button live-voice-inline-end" type="button" onClick={finish}
        title="Завершить разговор" aria-label="Завершить разговор"><PhoneOff size={16}/></button>
      <button className="live-voice-inline-close" type="button" onClick={finish} aria-label="Закрыть голосовой режим"><X size={14}/></button>
    </div>
    {caption && phase === 'speaking' ? <p className="live-voice-inline-caption" aria-live="polite">{caption.slice(-120)}</p> : null}
    {error ? <p role="alert" className="live-voice-inline-error">{error}</p> : null}
  </section>;
}
