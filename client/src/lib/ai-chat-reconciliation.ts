import type { ChatMessage } from './types';
import { preferRecentChatModel, readSavedAiChatModel } from './ai-chat-model';

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

/**
 * Historical project snapshots could copy one proposal chip into unrelated
 * conversations. A proposal belongs to a single chat, not every chat.
 * Keep its first occurrence (quick chat comes first in normalized projects)
 * and remove only cross-chat repeats. Preserve independently authored text.
 */
export function isolateTaskProposalChips<
  TMessage extends { content: string; taskProposal?: { id: string } | null },
  TChat extends { id: string; messages: TMessage[] },
  TProject extends { chats: TChat[] }
>(projects: TProject[]): TProject[] {
  const owner = new Map<string, { chatId: string; content: string }>();
  let changed = false;
  const next = projects.map(project => ({
    ...project,
    chats: project.chats.map(chat => ({
      ...chat,
      messages: chat.messages.flatMap(message => {
        const proposalId = message.taskProposal?.id;
        if (!proposalId) return [message];
        const seen = owner.get(proposalId);
        if (!seen) {
          owner.set(proposalId, { chatId: chat.id, content: message.content });
          return [message];
        }
        if (seen.chatId === chat.id) return [message];
        changed = true;
        if (seen.content === message.content) return [];
        const { taskProposal: _duplicate, ...rest } = message;
        return [rest as TMessage];
      })
    }))
  }));
  return changed ? next : projects;
}

export type AiChatProjectOutline = {
  id: string; title: string; color: string; icon: string;
  chats: Array<{ id: string; title: string; model?: string; modelChangedAt?: string }>;
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
  // The server's outline now INCLUDES the managed Telegram project. Never
  // append the local copy after mapping the same server project. Previously
  // each 2.5-second poll doubled/accumulated the Telegram folder and then
  // auto-saved an exponentially growing JSON snapshot.
  const cleanLocal = sanitizeCachedTelegramAssistantProjects(local);
  if (!outline.length) return cleanLocal;
  const regularOutline = outline.filter(project => !isTelegramAssistantProjectLike(project));
  const telegramOutline = outline.find(project => isTelegramAssistantProjectLike(project));
  const managed = cleanLocal.find(project => project.id === TELEGRAM_AI_PROJECT_ID);
  let changed = cleanLocal !== local;
  const regular = regularOutline.map(data => {
    const previous = cleanLocal.find(project => project.id === data.id);
    const chats = data.chats.map(thread => {
      const existing = previous?.chats.find(chat => chat.id === thread.id);
      if (!existing) { changed = true; return { ...thread, messages: [] } as unknown as TChat; }
      const mergedModel = preferRecentChatModel(existing as TChat & { model?: string; modelChangedAt?: string }, {
        model: readSavedAiChatModel(thread.model) ?? undefined, modelChangedAt: thread.modelChangedAt
      });
      const old = existing as TChat & { model?: string; modelChangedAt?: string };
      const modelChanged = mergedModel.model !== old.model || mergedModel.modelChangedAt !== old.modelChangedAt;
      if (existing.title === thread.title && !modelChanged) return existing;
      changed = true;
      return { ...existing, title: thread.title,
        ...(mergedModel.model ? { model: mergedModel.model } : {}),
        ...(mergedModel.modelChangedAt ? { modelChangedAt: mergedModel.modelChangedAt } : {}) };
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
  if (cleanLocal.filter(project => project.id !== TELEGRAM_AI_PROJECT_ID).length !== regularOutline.length) changed = true;

  // Telegram's authoritative chat list is hydrated separately from its inbox.
  // Keep the existing live transcript and approval chips when the outline is
  // refreshed for a regular project. If it has not been hydrated yet, use the
  // authenticated server outline just once.
  const telegram = managed ?? (telegramOutline ? {
    ...telegramOutline, id: TELEGRAM_AI_PROJECT_ID,
    chats: telegramOutline.chats.map(chat => ({ ...chat, messages: [] }))
  } as unknown as TProject : null);
  if (!managed && telegram) changed = true;
  if (!telegram && cleanLocal.some(project => project.id === TELEGRAM_AI_PROJECT_ID)) changed = true;
  if (!changed) return local;
  return [...regular, ...(telegram ? [telegram] : [])];
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

/**
 * Limit stale local cached Telegram navigation before network hydration.
 * The server later replaces the list with exact owner-scoped policy IDs.
 * Never generate a local Telegram assistant chat from a generic "New chat".
 */
export const TELEGRAM_AI_PROJECT_ID = 'telegram-ai-assistant-project';
const TG_CHAT_ID_PREFIX = 'telegram-ai-assistant:';

/** Recognize old browser-generated copies even when their UUID/icon differs. */
export function isTelegramAssistantProjectLike(project: {
  id?: string; title?: string; icon?: string;
  chats?: Array<{ id?: string }>;
}): boolean {
  if (project.id === TELEGRAM_AI_PROJECT_ID) return true;
  const title = (project.title ?? '').toLocaleLowerCase().replace(/[\\s_-]+/g, ' ').trim();
  if (title === 'телеграм ассистент' || title === 'telegram assistant') return true;
  if (project.icon === 'telegram') return true;
  return (project.chats ?? []).some(chat =>
    typeof chat?.id === 'string' && chat.id.startsWith(TG_CHAT_ID_PREFIX));
}

/**
 * Make a historically corrupted project tree safe BEFORE rendering or writing
 * it to localStorage. Preserve the canonical Telegram project (and its most
 * complete chat transcript), but do not keep copies created by polling.
 * Calling this repeatedly on a healthy tree must be referentially stable.
 */
export function sanitizeCachedTelegramAssistantProjects<
  TChat extends { id: string; title: string; messages?: unknown[] },
  TProject extends { id: string; title: string; color: string; icon: string; chats: TChat[] }
>(projects: TProject[]): TProject[] {
  const normals: TProject[] = [];
  const duplicates: TProject[] = [];
  for (const project of projects) {
    if (isTelegramAssistantProjectLike(project)) duplicates.push(project);
    else normals.push(project);
  }
  if (!duplicates.length) return projects;

  const primary = duplicates.find(project => project.id === TELEGRAM_AI_PROJECT_ID) ?? duplicates[0];
  const chats = new Map<string, TChat>();
  for (const project of [primary, ...duplicates.filter(candidate => candidate !== primary)]) {
    for (const chat of project.chats) {
      if (!chat.id.startsWith(TG_CHAT_ID_PREFIX)) continue;
      const previous = chats.get(chat.id);
      if (!previous) {
        if (chats.size < 25) chats.set(chat.id, chat);
      } else if ((chat.messages?.length ?? 0) > (previous.messages?.length ?? 0)) {
        chats.set(chat.id, chat);
      }
    }
  }
  const uniqueChats = [...chats.values()];
  if (duplicates.length === 1 && primary.id === TELEGRAM_AI_PROJECT_ID &&
    primary.title === 'Телеграм ассистент' && primary.icon === 'telegram' &&
    primary.chats.length === uniqueChats.length &&
    primary.chats.every((chat, index) => chat === uniqueChats[index]) &&
    projects[projects.length - 1] === primary) return projects;

  const clean = {
    ...primary, id: TELEGRAM_AI_PROJECT_ID, title: 'Телеграм ассистент',
    color: '#229ed9', icon: 'telegram', chats: uniqueChats
  } as TProject;
  return [...normals, clean];
}
