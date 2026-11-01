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
