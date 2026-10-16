/**
 * Merge chat messages by stable ID when website and Mini App save the same
 * project snapshot. The incoming project/chat list remains authoritative for
 * renames and deliberate deletions, but an out-of-date device cannot discard
 * messages already added to a conversation it still contains.
 */
type JsonMessage = { id: string; role?: string; content?: string; createdAt?: string; [key: string]: unknown };
type JsonChat = { id: string; title?: string; messages?: JsonMessage[]; [key: string]: unknown };
type JsonProject = { id: string; chats?: JsonChat[]; [key: string]: unknown };
const isRecord = (v: unknown): v is Record<string, unknown> => v != null && typeof v === 'object' && !Array.isArray(v);
function validProjects(value: unknown): JsonProject[] {
  if (!Array.isArray(value)) return [];
  return value.filter((p): p is JsonProject => isRecord(p) && typeof p.id === 'string' && Array.isArray(p.chats));
}
function validMessages(value: unknown): JsonMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter((m): m is JsonMessage => isRecord(m) && typeof m.id === 'string' && m.id.length > 0 &&
    (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
}

export function mergeChatProjectSnapshots(previous: unknown, incoming: unknown): JsonProject[] {
  const current = validProjects(previous);
  const before = new Map(current.map(p => [p.id, p]));
  return validProjects(incoming).map(project => {
    const previousChats = new Map((before.get(project.id)?.chats ?? []).map(c => [c.id, c]));
    const chats = (project.chats ?? []).filter(c => isRecord(c) && typeof c.id === 'string').map(chat => {
      const alreadySaved = validMessages(previousChats.get(chat.id)?.messages);
      const nowSubmitted = validMessages(chat.messages);
      // Existing messages first to preserve chronological order when individual
      // messages do not carry a timestamp (e.g. historical Mini App records).
      const merged = new Map<string, JsonMessage>(alreadySaved.map(m => [m.id, m]));
      for (const message of nowSubmitted) {
        const existing = merged.get(message.id);
        merged.set(message.id, existing ? { ...existing, ...message } : message);
      }
      return { ...chat, messages: [...merged.values()].slice(chat.id === 'quick-ai-requests' ? -100 : -300) };
    });
    return { ...project, chats };
  });
}

/**
 * Telegram assistant conversations are derived exclusively from the owner's
 * active Telegram monitor policies. Browser project snapshots are not allowed
 * to invent, duplicate or retain Telegram assistant chat IDs.
 *
 * Preserve messages on the correctly linked chat; do not erase interactive
 * Telegram consent cards or the user's manual replies.
 */
export const TELEGRAM_ASSISTANT_MANAGED_PROJECT = 'telegram-ai-assistant-project';
const TG_PREFIX = 'telegram-ai-assistant:';
type ManagedPolicy = { id: string; chatTitle: string };
export function canonicalizeTelegramAssistantProjects(
  projects: unknown,
  policies: readonly ManagedPolicy[]
): JsonProject[] {
  const source = validProjects(projects);
  const normal = source.filter(p => p.id !== TELEGRAM_ASSISTANT_MANAGED_PROJECT &&
    !(p.title === 'Телеграм ассистент' && p.icon === 'telegram'));
  if (policies.length === 0) return normal;
  const managed = source.filter(p => p.id === TELEGRAM_ASSISTANT_MANAGED_PROJECT ||
    (p.title === 'Телеграм ассистент' && p.icon === 'telegram'));
  const messagesById = new Map<string, JsonMessage[]>();
  for (const project of managed) {
    for (const chat of project.chats ?? []) {
      if (!isRecord(chat) || typeof chat.id !== 'string' || !chat.id.startsWith(TG_PREFIX)) continue;
      const messages = messagesById.get(chat.id) ?? [];
      const combined = new Map(messages.map(m => [m.id, m]));
      for (const message of validMessages(chat.messages)) {
        const old = combined.get(message.id);
        combined.set(message.id, old ? { ...old, ...message } : message);
      }
      messagesById.set(chat.id, [...combined.values()].slice(-300));
    }
  }
  const uniquePolicies = new Map(policies.map(p => [p.id, p]));
  const first = managed[0];
  const assistantProject: JsonProject = {
    id: TELEGRAM_ASSISTANT_MANAGED_PROJECT, title: 'Телеграм ассистент',
    icon: 'telegram', color: '#229ed9',
    chats: [...uniquePolicies.values()].map(policy => {
      const id = TG_PREFIX + policy.id;
      return { id, title: policy.chatTitle, messages: messagesById.get(id) ?? [] };
    })
  };
  // Return canonical managed project last, keeping the default personal
  // project at index zero so quick requests never attach to Telegram chats.
  return [...normal, assistantProject];
}
