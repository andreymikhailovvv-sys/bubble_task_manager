/** Public models for chat and monitoring; preserve old browser and DB selections. */
export const SELECTABLE_AI_CHAT_MODELS = ['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol'] as const;
export type SelectableAiChatModel = typeof SELECTABLE_AI_CHAT_MODELS[number];

export function normalizeSelectableAiChatModel(value: unknown): SelectableAiChatModel | undefined {
  if (value === 'gpt-5.4-mini') return 'gpt-6.1-terra';
  return SELECTABLE_AI_CHAT_MODELS.find(model => model === value);
}
