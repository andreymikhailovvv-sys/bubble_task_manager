import type { AiChatModel } from './types';

export const DEFAULT_QUICK_AI_CHAT_MODEL: AiChatModel = 'gpt-6-luna';
export const DEFAULT_WEB_PROJECT_CHAT_MODEL: AiChatModel = 'gpt-6.1-terra';
export const DEFAULT_MOBILE_PROJECT_CHAT_MODEL: AiChatModel = 'gpt-6-luna';

/** Stored per conversation in the shared project JSON, not in a global UI state. */
export function readSavedAiChatModel(value: unknown): AiChatModel | null {
  if (value === 'gpt-5.4-mini') return 'gpt-6.1-terra';
  return value === 'gpt-6-luna' || value === 'gpt-6.1-terra' || value === 'gpt-6.1-sol' ? value : null;
}

export function preferRecentChatModel<T extends { model?: unknown; modelChangedAt?: unknown }>(
  saved: T | undefined, incoming: T
): T {
  const oldModel = readSavedAiChatModel(saved?.model);
  const newModel = readSavedAiChatModel(incoming.model);
  const oldTime = typeof saved?.modelChangedAt === 'string' ? Date.parse(saved.modelChangedAt) : 0;
  const newTime = typeof incoming.modelChangedAt === 'string' ? Date.parse(incoming.modelChangedAt) : 0;
  if (oldModel && (!newModel || (Number.isFinite(oldTime) && oldTime > (Number.isFinite(newTime) ? newTime : 0)))) {
    return { ...incoming, model: oldModel, modelChangedAt: saved?.modelChangedAt };
  }
  return { ...incoming, ...(newModel ? { model: newModel } : {}) };
}
