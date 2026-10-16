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
