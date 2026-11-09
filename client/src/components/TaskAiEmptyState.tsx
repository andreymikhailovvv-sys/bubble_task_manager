import { AiChatWelcome } from './AiChatWelcome';

/** Compact, shared empty state for task AI on desktop and in the Mini App. */
export function TaskAiEmptyState({ variant = 'web', themeMode }: {
  variant?: 'web' | 'miniapp';
  themeMode?: 'light' | 'dark';
}) {
  return <AiChatWelcome kind="task" variant={variant} themeMode={themeMode} />;
}
