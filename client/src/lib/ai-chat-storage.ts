import type { ChatMessage } from './types';

type CachedMessage = ChatMessage & { id: string };
type CachedProject = {
  id: string;
  title: string;
  color: string;
  icon: string;
  chats: Array<{ id: string; title: string; messages: CachedMessage[] }>;
};

/**
 * Browser storage is only a startup cache. The server owns complete chat history.
 * Never serialize every message and its full search/attachment metadata into
 * localStorage: Telegram WebViews commonly have a small storage quota.
 */
export function persistAiChatProjectsCache(
  storage: Pick<Storage, 'setItem'>,
  key: string,
  projects: CachedProject[]
): void {
  const compact = projects.map(project => ({
    id: project.id, title: project.title, color: project.color, icon: project.icon,
    chats: project.chats.map(chat => ({
      id: chat.id, title: chat.title,
      messages: chat.messages.slice(-12).map(message => ({
        id: message.id,
        role: message.role,
        content: message.content.slice(0, 4_000),
        ...(message.createdAt ? { createdAt: message.createdAt } : {}),
        ...(message.creditsSpentMilli != null ? { creditsSpentMilli: message.creditsSpentMilli } : {}),
        ...(message.generatedDocument ? { generatedDocument: message.generatedDocument } : {}),
        ...(message.taskProposal ? { taskProposal: message.taskProposal } : {}),
        ...(message.telegramSendDraft ? { telegramSendDraft: message.telegramSendDraft } : {}),
        ...(message.telegramReadDraft ? { telegramReadDraft: message.telegramReadDraft } : {})
      }))
    }))
  }));
  try {
    storage.setItem(key, JSON.stringify(compact));
  } catch {
    // If even a compact cache cannot fit, keep only navigation metadata.
    // A storage quota failure must never unmount an active consent card.
    try {
      storage.setItem(key, JSON.stringify(compact.map(project => ({
        ...project, chats: project.chats.map(chat => ({ ...chat, messages: [] }))
      }))));
    } catch {
      // Browsers can disable storage entirely. Remote persistence still works.
    }
  }
}
