import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Loader2, Square, Volume2 } from 'lucide-react';
import { api } from '../lib/api';
import { formatCreditsSpent } from '../lib/credits';

type State = 'idle' | 'loading' | 'playing';
type CachedSpeech = { blob: Blob; creditsSpentMilli: number };
let currentOwner: (() => void) | null = null;
const speechCache = new Map<string, CachedSpeech>();
const messageCharges = new Map<string, number>();
const chargeListeners = new Set<() => void>();
function subscribeCharges(listener: () => void) {
  chargeListeners.add(listener);
  return () => { chargeListeners.delete(listener); };
}
function addSpeechCharge(key: string, charge: number) {
  messageCharges.set(key, (messageCharges.get(key) ?? 0) + charge);
  chargeListeners.forEach(listener => listener());
}

// This renders INSIDE the existing AI bubble, below normal answer credits.
export function AiSpeechCostLine({ messageKey, className = '' }: { messageKey: string; className?: string }) {
  const charged = useSyncExternalStore(subscribeCharges, () => messageCharges.get(messageKey), () => undefined);
  if (charged === undefined) return null;
  return <div className={`ai-speech-cost-line mt-1 text-[10px] text-muted opacity-75 ${className}`}>
    Озвучка: {charged === 0 ? '0 кредитов (повторное воспроизведение)' : formatCreditsSpent(charged)}
  </div>;
}

export function AiReadAloudAction({ text, messageKey }: { text: string; messageKey: string }) {
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const aliveRef = useRef(true);
  const pendingRef = useRef(0);

  const stop = () => {
    pendingRef.current += 1;
    if (audioRef.current) {
      const audio = audioRef.current;
      audioRef.current = null;
      // Clearing src on a finished HTMLAudioElement may emit an artificial error.
      audio.onerror = null;
      audio.onended = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    if (currentOwner === stop) currentOwner = null;
    if (aliveRef.current) setState('idle');
  };

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; stop(); };
  }, []);

  const toggle = async () => {
    if (state !== 'idle') { stop(); return; }
    if (currentOwner && currentOwner !== stop) currentOwner();
    setError('');
    setState('loading');
    const request = ++pendingRef.current;
    try {
      let cached = speechCache.get(text);
      if (!cached) {
        cached = await api.speakVoice(text);
        if (speechCache.size >= 15) speechCache.delete(speechCache.keys().next().value!);
        speechCache.set(text, cached);
        // Charge only on an actual server generation, not when playing cached audio.
        addSpeechCharge(messageKey, cached.creditsSpentMilli);
      } else if (!messageCharges.has(messageKey)) {
        addSpeechCharge(messageKey, 0);
      }
      if (pendingRef.current !== request || !aliveRef.current) return;
      const url = URL.createObjectURL(cached.blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      urlRef.current = url;
      currentOwner = stop;
      audio.onended = () => { if (audioRef.current === audio) stop(); };
      audio.onerror = () => {
        if (audioRef.current !== audio) return;
        stop();
        if (aliveRef.current) setError('Не удалось воспроизвести аудио.');
      };
      await audio.play();
      if (pendingRef.current === request && aliveRef.current) setState('playing');
    } catch (cause) {
      if (pendingRef.current !== request || !aliveRef.current) return;
      stop();
      if (aliveRef.current) setError(cause instanceof Error ? cause.message : 'Не удалось озвучить сообщение.');
    }
  };

  return <span className="ai-read-aloud-holder">
    <button type="button" className="ai-message-reply-trigger ai-read-aloud-trigger" onClick={() => void toggle()}
      title={state === 'playing' ? 'Остановить чтение' : 'Прочитать вслух (голос создан ИИ)'}
      aria-label={state === 'playing' ? 'Остановить чтение' : 'Прочитать вслух'}
      disabled={!text.trim()}>
      {state === 'loading' ? <Loader2 size={16} className="ai-speech-loading-spin" /> : state === 'playing' ? <Square size={14}/> : <Volume2 size={17}/>}
    </button>
    {error ? <span role="alert" className="ai-read-aloud-message" title={error}>{error}</span> : null}
  </span>;
}
