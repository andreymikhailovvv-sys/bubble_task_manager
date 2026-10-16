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

/**
 * Telegram inbox polling contains published monitor summaries, not every
 * conversation message. Preserve locally rendered assistant replies and
 * pending consent/send cards while updating and appending inbox events.
 */
export function mergeTelegramManagedMessages<T extends IdentifiedChatMessage>(
  local: T[], remoteSummaries: T[]
): T[] {
  const byId = new Map(local.map(message => [message.id, message] as const));
  for (const incoming of remoteSummaries) {
    const existing = byId.get(incoming.id);
    if (!existing) {
      byId.set(incoming.id, incoming);
      continue;
    }
    const merged = { ...existing, ...incoming };
    byId.set(incoming.id, JSON.stringify(merged) === JSON.stringify(existing) ? existing : merged);
  }
  const next = [...byId.values()].slice(-300);
  return next.length === local.length && next.every((message, index) => message === local[index])
    ? local
    : next;
}

/**
 * A project snapshot stores interactive cards that the legacy general-dialog
 * feed cannot represent (Telegram read/send consent, documents, proposals).
 * Polling that feed must never replace messages with lossy copies. Keep the
 * existing message/key/component stable; merge new server text and cards.
 *
 * General-dialog rows may also have different database IDs than the client
 * project snapshot of the same content. Match those by role + exact content
 * in occurrence order, rather than rendering duplicates on each poll.
 */
export function reconcileAiChatMessagesWithChips<T extends IdentifiedChatMessage>(
  local: T[], remote: T[]
): T[] {
  if (remote.length === 0) return local;
  if (local.length === 0) return remote;
  // Index each message once instead of scanning the whole transcript for
  // every item received in the frequent chat polling response.
  type MatchQueue = { indices: number[]; cursor: number };
  const byId = new Map<string, MatchQueue>();
  const byContent = new Map<string, MatchQueue>();
  const queueIndex = (index: Map<string, MatchQueue>, key: string, position: number) => {
    const entry = index.get(key);
    if (entry) entry.indices.push(position);
    else index.set(key, { indices: [position], cursor: 0 });
  };
  for (let i = 0; i < local.length; i++) {
    const message = local[i];
    queueIndex(byId, message.id, i);
    queueIndex(byContent, JSON.stringify([message.role, message.content]), i);
  }
  const matchedLocal = new Set<number>();
  const takeMatch = (index: Map<string, MatchQueue>, key: string): number => {
    const queue = index.get(key);
    if (!queue) return -1;
    while (queue.cursor < queue.indices.length) {
      const position = queue.indices[queue.cursor++];
      if (!matchedLocal.has(position)) return position;
    }
    return -1;
  };
  const additions: T[] = [];
  const updates = new Map<number, T>();
  for (const message of remote) {
    let index = takeMatch(byId, message.id);
    if (index < 0) index = takeMatch(byContent, JSON.stringify([message.role, message.content]));
    if (index < 0) {
      additions.push(message);
      continue;
    }
    matchedLocal.add(index);
    const original = local[index];
    // If the server's older format omits a chip, leave the original intact.
    const combined = { ...original, ...message, id: original.id,
      ...(message.telegramReadDraft == null && original.telegramReadDraft
        ? { telegramReadDraft: original.telegramReadDraft } : {}),
      ...(message.telegramSendDraft == null && original.telegramSendDraft
        ? { telegramSendDraft: original.telegramSendDraft } : {}),
      ...(message.taskProposal == null && original.taskProposal
        ? { taskProposal: original.taskProposal } : {}),
      ...(message.generatedDocument == null && original.generatedDocument
        ? { generatedDocument: original.generatedDocument } : {}) } as T;
    // Usually polling returns identical primitive fields. Skip serializing
    // whole messages unless a field really differs by reference.
    const sameFields = Object.keys(original).length === Object.keys(combined).length &&
      (Object.keys(combined) as Array<keyof T>).every(key => original[key] === combined[key]);
    if (!sameFields && JSON.stringify(original) !== JSON.stringify(combined)) updates.set(index, combined);
  }
  if (updates.size === 0 && additions.length === 0) return local;
  return [...local.map((message, index) => updates.get(index) ?? message), ...additions];
}
