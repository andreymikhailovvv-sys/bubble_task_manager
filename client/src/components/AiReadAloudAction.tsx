import { useEffect, useRef, useState } from 'react';
import { Loader2, Square, Volume2 } from 'lucide-react';
import { api } from '../lib/api';

type State = 'idle' | 'loading' | 'playing';
let currentAudio: HTMLAudioElement | null = null;
let currentOwner: (() => void) | null = null;
const speechCache = new Map<string, Blob>();

export function AiReadAloudAction({ text }: { text: string }) {
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const aliveRef = useRef(true);
  const pendingRef = useRef(0);

  const stop = () => {
    pendingRef.current += 1;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    if (currentOwner === stop) { currentAudio = null; currentOwner = null; }
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
      let blob = speechCache.get(text);
      if (!blob) {
        blob = await api.speakVoice(text);
        if (speechCache.size >= 15) speechCache.delete(speechCache.keys().next().value!);
        speechCache.set(text, blob);
      }
      if (pendingRef.current !== request || !aliveRef.current) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      urlRef.current = url;
      currentAudio = audio;
      currentOwner = stop;
      audio.onended = stop;
      audio.onerror = () => { setError('Не удалось воспроизвести аудио.'); stop(); };
      await audio.play();
      if (pendingRef.current === request && aliveRef.current) setState('playing');
    } catch (cause) {
      if (pendingRef.current !== request || !aliveRef.current) return;
      setError(cause instanceof Error ? cause.message : 'Не удалось озвучить сообщение.');
      stop();
    }
  };

  return <span className="ai-read-aloud-holder">
    <button type="button" className="ai-message-reply-trigger ai-read-aloud-trigger" onClick={() => void toggle()}
      title={state === 'playing' ? 'Остановить чтение' : 'Прочитать вслух (голос создан ИИ)'}
      aria-label={state === 'playing' ? 'Остановить чтение' : 'Прочитать вслух'}
      disabled={!text.trim()}>
      {state === 'loading' ? <Loader2 size={16} className="animate-spin" /> : state === 'playing' ? <Square size={14}/> : <Volume2 size={17}/>}
    </button>
    {error ? <span role="alert" className="ai-read-aloud-error" title={error}>!</span> : null}
  </span>;
}
