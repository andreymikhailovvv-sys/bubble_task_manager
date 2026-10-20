import { Sparkles } from 'lucide-react';

/** Shared empty state for task-specific AI chats on desktop and in the Mini App. */
export function TaskAiEmptyState({ variant = 'web' }: { variant?: 'web' | 'miniapp' }) {
  return (
    <div className={variant === 'miniapp' ? 'miniapp-ai-chat-empty' : 'task-ai-chat-empty'} role="status">
      <span className={variant === 'miniapp' ? 'miniapp-ai-chat-empty-icon' : 'task-ai-chat-empty-icon'} aria-hidden="true">
        <Sparkles size={34} strokeWidth={1.8} />
      </span>
      <strong>ИИ готов помочь</strong>
      <p>Спросите, как эффективнее выполнить эту задачу, или попросите составить план.</p>
    </div>
  );
}
