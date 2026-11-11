import type { AiChatResult, TaskAssistantResult } from './api';

export type PlanikVoice = 'echo' | 'ash' | 'cedar';
export const PLANIK_VOICE_STORAGE_KEY = 'planirovych:planik-realtime-voice';
export const PLANIK_VOICE_OPTIONS: ReadonlyArray<{ value: PlanikVoice; label: string }> = [
  { value: 'echo', label: 'Эхо · звонкий' },
  { value: 'ash', label: 'Эш · мягкий' },
  { value: 'cedar', label: 'Кедр · глубокий' }
];

export function normalizePlanikVoice(value: unknown): PlanikVoice {
  return value === 'ash' || value === 'cedar' || value === 'echo' ? value : 'echo';
}

/** Only an actual interactive result should uncover the underlying chat.
 * Information-only tool requests and plain spoken answers remain fullscreen. */
export function hasPlanikActionSurface(result: AiChatResult | TaskAssistantResult): boolean {
  return Boolean(
    result.taskProposal || result.telegramSendDraft || result.mailSendDraft ||
    result.telegramReadDraft || result.generatedDocument ||
    /\[\[task_ref(?:[:=])[^\]]+\]\]/.test(result.answer)
  );
}
