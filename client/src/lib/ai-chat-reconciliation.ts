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
      message.telegramSendDraft?.id === other.telegramSendDraft?.id &&
      message.telegramReadDraft?.id === other.telegramReadDraft?.id;
  })) return local;

  return remote;
}
