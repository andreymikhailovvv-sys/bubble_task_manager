const REASONING_EFFORT_MODELS = new Set([
  'gpt-6-luna',
  'gpt-5.4-mini',
  'gpt-6.1-sol',
  'gpt-5-mini',
  'gpt-5-nano'
]);

/** Model capabilities are intentionally explicit: a shared name prefix is not a capability contract. */
export function supportsReasoningEffort(model: string): boolean {
  return REASONING_EFFORT_MODELS.has(model.trim().toLowerCase());
}
