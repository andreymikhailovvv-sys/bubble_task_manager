import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MessageCircle, Radio, SendHorizontal, Square, X } from 'lucide-react';
import { LiveVoiceDialog, type LiveVoiceContext, type LiveVoiceMessage, type LiveVoiceToolCompletion } from './LiveVoiceDialog';
import { api } from '../lib/api';

type Props = {
  onTranscript: (text: string, sendImmediately: boolean) => void;
  liveContext?: LiveVoiceContext;
  onLiveMessage?: (message: LiveVoiceMessage) => void;
  onLiveToolResult?: (result: LiveVoiceToolCompletion) => void;
  disabled?: boolean;
  small?: boolean;
  className?: string;
};

type VoiceState = 'idle' | 'recording' | 'transcribing';

export function VoiceInputButton({ onTranscript, liveContext, onLiveMessage, onLiveToolResult, disabled = false, small = false, className = '' }: Props) {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveAudioContext, setLiveAudioContext] = useState<AudioContext | null>(null);
  const menuRef = useRef<HTMLSpanElement | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(25).fill(0.12));
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(0);
  const cancelledRef = useRef(false);
  const immediateRef = useRef(false);
  const aliveRef = useRef(true);

  const release = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    cancelAnimationFrame(animationRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
    void contextRef.current?.close().catch(() => undefined);
    contextRef.current = null;
  };

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      cancelledRef.current = true;
      const recorder = recorderRef.current;
      if (recorder?.state === 'recording') recorder.stop();
      release();
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);

  const startLive = () => {
    setMenuOpen(false);
    // Create/resume the playback context synchronously with the user's tap,
    // before Telegram WebView/browser autoplay policies discard user activation.
    try {
      const context = new AudioContext();
      void context.resume().catch(() => undefined);
      setLiveAudioContext(context);
    } catch { setLiveAudioContext(null); }
    setLiveOpen(true);
  };

  const stop = (sendImmediately: boolean) => {
    immediateRef.current = sendImmediately;
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') {
      setState('transcribing');
      recorder.stop();
    }
  };

  const cancel = () => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    release();
    setState('idle'); setSeconds(0); setError('');
  };

  const start = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Этот браузер не поддерживает запись с микрофона.');
      return;
    }
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      .find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { setError('Встроенный браузер не поддерживает совместимый формат записи.'); return; }
    try {
      cancelledRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!aliveRef.current || cancelledRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.onerror = () => { release(); if (aliveRef.current) { setState('idle'); setError('Ошибка записи. Попробуйте ещё раз.'); } };
      recorder.onstop = async () => {
        release();
        if (cancelledRef.current || !aliveRef.current) return;
        const recorded = new Blob(chunks, { type: mimeType });
        if (recorded.size > 6 * 1024 * 1024 || recorded.size < 100) {
          setState('idle'); setError('Запись слишком короткая или большая. Попробуйте ещё раз.'); return;
        }
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Не удалось прочитать запись.'));
            reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
            reader.readAsDataURL(recorded);
          });
          const result = await api.transcribeVoice({ audioBase64: base64, mimeType, durationSeconds: Math.max(0.1, (performance.now() - startedRef.current) / 1000) });
          if (cancelledRef.current || !aliveRef.current) return;
          onTranscript(result.text, immediateRef.current);
          setState('idle'); setSeconds(0);
        } catch (cause) {
          if (aliveRef.current && !cancelledRef.current) {
            setState('idle');
            setError(cause instanceof Error ? cause.message : 'Не удалось расшифровать запись.');
          }
        }
      };
      const context = new AudioContext();
      contextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;
      const frequency = new Uint8Array(analyser.frequencyBinCount);
      let lastFrame = 0;
      const animate = (now: number) => {
        if (now - lastFrame > 65) {
          lastFrame = now;
          analyser.getByteFrequencyData(frequency);
          setLevels(Array.from({ length: 25 }, (_, i) => Math.max(0.12, (frequency[Math.min(frequency.length - 1, i + 2)] || 0) / 255)));
        }
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
      recorder.start(250);
      startedRef.current = performance.now();
      setSeconds(0); setState('recording');
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((performance.now() - startedRef.current) / 1000);
        setSeconds(elapsed);
        if (elapsed >= 120) stop(false);
      }, 500);
    } catch (cause) {
      release();
      setError(cause instanceof DOMException && cause.name === 'NotAllowedError'
        ? 'Разрешите доступ к микрофону в настройках браузера или Telegram.'
        : 'Не удалось включить микрофон.');
      setState('idle');
    }
  };

  return <>
    <span className="voice-mode-anchor" ref={menuRef}>
      <button type="button" disabled={disabled || state !== 'idle' || liveOpen} onClick={() => setMenuOpen(value => !value)}
        className={`voice-input-trigger inline-flex ${small ? 'h-9 w-9' : 'h-11 w-11'} shrink-0 items-center justify-center rounded-full disabled:opacity-50 ${className}`}
        title="Выбрать голосовой режим" aria-label="Выбрать голосовой режим" aria-expanded={menuOpen}>
        <Mic size={small ? 16 : 17} />
      </button>
      {menuOpen ? <div className="voice-mode-menu dialog-surface" role="menu" aria-label="Голосовой режим">
        <button type="button" role="menuitem" onClick={startLive}>
          <Radio size={18} /><span><strong>Живое общение</strong><small>Говорите с ИИ без пауз на отправку</small></span>
        </button>
        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void start(); }}>
          <MessageCircle size={18}/><span><strong>Запись голосом</strong><small>Продиктовать, расшифровать и отправить</small></span>
        </button>
      </div> : null}
      {liveOpen ? <LiveVoiceDialog liveContext={liveContext} audioContext={liveAudioContext}
        onLiveMessage={onLiveMessage} onLiveToolResult={onLiveToolResult}
        onClose={() => { setLiveOpen(false); setLiveAudioContext(null); }} /> : null}
    </span>
    {error && state === 'idle' ? <div role="alert" className="voice-input-error">{error}
      <button type="button" title="Закрыть ошибку" onClick={() => setError('')}><X size={13} /></button>
    </div> : null}
    {state !== 'idle' ? <div className="voice-record-backdrop" onClick={event => { if (event.target === event.currentTarget) cancel(); }}>
      <div className="voice-record-panel dialog-surface" role="dialog" aria-modal="true" aria-label="Голосовой ввод">
        <div className="voice-record-title"><Mic size={18}/>{state === 'recording' ? 'Голосовой ввод' : 'Расшифровываем запись…'}</div>
        <div className="voice-record-wave" aria-hidden="true">
          {levels.map((level, i) => <span key={i} style={{ height: `${Math.max(5, level * 58)}px` }} />)}
        </div>
        <div className="voice-record-timer">{state === 'recording' ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : 'Обрабатываем речь и считаем кредиты'}</div>
        {state === 'recording' ? <div className="voice-record-buttons">
          <button type="button" className="voice-record-cancel" onClick={cancel} title="Отменить запись"><X size={17}/>Отмена</button>
          <button type="button" className="voice-record-stop" onClick={() => stop(false)} title="Остановить и оставить текст"><Square size={15}/>В текст</button>
          <button type="button" className="voice-record-send" onClick={() => stop(true)} title="Расшифровать и отправить"><SendHorizontal size={16}/>Отправить</button>
        </div> : <div className="voice-record-buttons"><Loader2 className="animate-spin" size={20}/><span className="text-sm">После обработки окно закроется автоматически</span></div>}
        <p className="voice-record-note">Распознавание оплачивается кредитами. Запись не отправляется в чат без вашего действия.</p>
      </div>
    </div> : null}
  </>;
}
