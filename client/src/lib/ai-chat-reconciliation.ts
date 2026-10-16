import type { ChatMessage } from './types';

type IdentifiedChatMessage = ChatMessage & { id: string };

function messageIdentity(message: IdentifiedChatMessage): string {
  return message.id || message.role + ':' + message.content;
}

/** Mirrors the stable, diff-only task chat history reconciliation. */
export function reconcileActiveAiChatMessages<T extends IdentifiedChatMessage>(
  local: T[], remote: T[], sending: boolean
): T[] {
  if (sending) return local;

  // A just-entered message that has not yet reached server history must
  // remain visible. The next successful write will confirm it.
  if (local.length > remote.length &&
      remote.every((message, index) =>
        messageIdentity(local[index]) === messageIdentity(message) ||
        (local[index]?.role === message.role && local[index]?.content === message.content))) {
    return local;
  }

  if (local.length === remote.length && local.every((message, index) => {
    const other = remote[index];
    return other && messageIdentity(message) === messageIdentity(other) &&
      message.role === other.role && message.content === other.content &&
      message.creditsSpentMilli === other.creditsSpentMilli &&
      message.taskProposal?.id === other.taskProposal?.id &&
      message.taskProposal?.status === other.taskProposal?.status &&
      JSON.stringify(message.telegramSendDraft ?? null) === JSON.stringify(other.telegramSendDraft ?? null) &&
      JSON.stringify(message.telegramReadDraft ?? null) === JSON.stringify(other.telegramReadDraft ?? null);
  })) return local;

  return remote;
}

export type AiChatProjectOutline = {
  id: string; title: string; color: string; icon: string;
  chats: Array<{ id: string; title: string }>;
};

/**
 * Reconcile only chat navigation metadata, never active selection, scroll
 * container or any already rendered transcript. New chats load messages
 * separately when opened, exactly like opening a task chat.
 */
export function reconcileAiChatProjectOutline<
  TMessage,
  TChat extends { id: string; title: string; messages: TMessage[] },
  TProject extends { id: string; title: string; color: string; icon: string; chats: TChat[] }
>(local: TProject[], outline: AiChatProjectOutline[]): TProject[] {
  if (!outline.length) return local;
  const managed = local.filter(p => p.id === 'telegram-ai-assistant-project');
  let changed = false;
  const result = outline.map(data => {
    const previous = local.find(p => p.id === data.id);
    const chats = data.chats.map(thread => {
      const existing = previous?.chats.find(c => c.id === thread.id);
      if (!existing) { changed = true; return { ...thread, messages: [] } as unknown as TChat; }
      if (existing.title === thread.title) return existing;
      changed = true;
      return { ...existing, title: thread.title };
    });
    if (!previous) {
      changed = true;
      return { ...data, chats } as TProject;
    }
    if (previous.title === data.title && previous.color === data.color &&
        previous.icon === data.icon && previous.chats.length === chats.length &&
        chats.every((chat, index) => chat === previous.chats[index])) return previous;
    changed = true;
    return { ...previous, title: data.title, color: data.color, icon: data.icon, chats };
  });
  if (local.filter(p => p.id !== 'telegram-ai-assistant-project').length !== outline.length) changed = true;
  if (!changed) return local;
  return [...result, ...managed];
}
