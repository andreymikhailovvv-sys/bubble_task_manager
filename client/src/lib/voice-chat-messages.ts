import type { ChatMessage } from './types';
import type { LiveVoiceMessage, LiveVoiceToolCompletion } from '../components/LiveVoiceDialog';

export function voiceTranscriptMessage(value: LiveVoiceMessage): ChatMessage & { id: string } {
  return {
    id: value.id, role: value.role, content: value.text,
    createdAt: new Date().toISOString()
  };
}

/** Native chat renderers already understand every card on this message. Never
 * render tool action cards in a separate voice-specific component. */
export function voiceToolAssistantMessage(entry: LiveVoiceToolCompletion): ChatMessage & { id: string } {
  const result = entry.result;
  const reports = result.actionReports?.length ? '\n\nИзменения:\n- ' + result.actionReports.join('\n- ') : '';
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: result.answer + reports,
    createdAt: new Date().toISOString(),
    creditsSpentMilli: result.billing?.creditsSpentMilli,
    taskProposal: result.taskProposal ?? undefined,
    generatedDocument: result.generatedDocument ?? undefined,
    telegramSendDraft: result.telegramSendDraft ?? undefined,
    mailSendDraft: result.mailSendDraft ?? undefined,
    telegramReadDraft: result.telegramReadDraft ?? undefined,
    webSearchUsed: result.webSearchUsed,
    webSources: result.webSources,
    webCitations: result.webCitations
  };
}

/** Track only the chat currently doing delegated voice work. Clearing a call
 * must not disturb a regular text request or another chat's progress. */
export function updateLiveVoiceProgress<T extends string>(
  previous: Record<string, T>, key: string, status: T | null
): Record<string, T> {
  if (status === null) {
    if (!(key in previous)) return previous;
    const next = { ...previous };
    delete next[key];
    return next;
  }
  return previous[key] === status ? previous : { ...previous, [key]: status };
}

/** Voice narration and local confirmation cards may not yet exist in the remote
 * chat history. Polling must merge them rather than wiping the transcript.
 * Once the server has the same entry, use its authoritative message/cards. */
export function preserveLiveVoiceMessages<T extends { id?: string; role: string; content: string; createdAt?: string }>(
  remote: T[], voice: T[]
): T[] {
  if (!voice.length) return remote;
  const missing = voice.filter(message => !remote.some(item =>
    (message.id && item.id === message.id) ||
    (item.role === message.role && item.content === message.content)));
  if (!missing.length) return remote;
  const combined = [...remote, ...missing];
  // Keep chronological order when timestamps are available, otherwise keep
  // server messages before locally received voice events.
  return combined.sort((a, b) =>
    a.createdAt && b.createdAt ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : 0);
}
