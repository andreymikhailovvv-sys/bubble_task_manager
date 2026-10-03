import type { ChatMessage } from './types';

export type ChatMessageWithId = ChatMessage & { id: string };

export function attachChatMessageId(message: ChatMessage, id: string): ChatMessageWithId {
  return { ...message, id };
}
