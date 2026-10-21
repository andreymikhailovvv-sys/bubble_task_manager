import { Reply, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChatMessage } from '../lib/types';

const START = '[[PLANNER_AI_REPLY_BEGIN]]';
const END = '[[PLANNER_AI_REPLY_END]]';
const MAX_QUOTE = 12000;

export type AiReplyTarget = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  fileNames: string[];
  generatedDocumentId?: string;
};

/** Preserve original message and file identities in the provider-visible message.
 * The displayed quote is compact, but the model receives the actual text. */
export function makeAiReplyTarget(message: ChatMessage): AiReplyTarget {
  return {
    id: message.id ?? '',
    role: message.role,
    content: message.content,
    // The server may strip display-only thumbnails during sync; the file names
    // are also present in the saved message text.
    fileNames: message.attachmentPreviews?.length
      ? message.attachmentPreviews.map(item => item.name).filter(Boolean)
      : (message.content.match(/(?:^|\n)📎 Файлы: ([^\n]+)/)?.[1] ?? '').split(', ').filter(Boolean),
    ...(message.generatedDocument?.id ? { generatedDocumentId: message.generatedDocument.id } : {})
  };
}

export function serializeAiReply(question: string, target: AiReplyTarget | null): string {
  if (!target) return question;
  const payload = {
    messageId: target.id,
    role: target.role,
    quotedText: target.content.length > MAX_QUOTE ? target.content.slice(0, MAX_QUOTE) + ' [цитата сокращена]' : target.content,
    attachmentMessageId: target.id || null, // Database confirms whether this original message has attachments.
    attachmentNames: target.fileNames.slice(0, 30),
    generatedDocumentId: target.generatedDocumentId ?? null
  };
  return START + '\n' + JSON.stringify(payload) + '\n' + END + '\n' + question;
}

export function parseAiReply(content: string): { reply: AiReplyTarget; text: string } | null {
  if (!content.startsWith(START + '\n')) return null;
  const end = content.indexOf('\n' + END + '\n', START.length);
  if (end < 0 || end > 22000) return null;
  try {
    const data = JSON.parse(content.slice(START.length + 1, end)) as Record<string, unknown>;
    if (typeof data.quotedText !== 'string' || (data.role !== 'assistant' && data.role !== 'user')) return null;
    return {
      reply: {
        id: typeof data.messageId === 'string' ? data.messageId : '',
        role: data.role,
        content: data.quotedText,
        fileNames: Array.isArray(data.attachmentNames) ? data.attachmentNames.filter((item): item is string => typeof item === 'string').slice(0, 30) : [],
        ...(typeof data.generatedDocumentId === 'string' ? { generatedDocumentId: data.generatedDocumentId } : {})
      },
      text: content.slice(end + END.length + 2)
    };
  } catch { return null; }
}

export function AiReplyAction({ message, onReply }: { message: ChatMessage; onReply: (target: AiReplyTarget) => void }) {
  return <button type="button" className="ai-message-reply-trigger" title="Ответить на сообщение" aria-label="Ответить на сообщение" onClick={() => onReply(makeAiReplyTarget(message))}>
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {/* Use nearly the whole 24px viewBox, matching the Send icon's visible bounds.
          The older path only occupied y=7..21 and looked much smaller on mobile. */}
      <path d="m11 2-9 10 9 10" />
      <path d="M2 12h9c7 0 11 3 11 10" />
    </svg>
  </button>;
}

export function AiReplyPreview({ target, onDismiss, compact = false }: { target: AiReplyTarget; onDismiss?: () => void; compact?: boolean }) {
  return <div className={`ai-reply-preview ${compact ? 'ai-reply-preview-compact' : ''}`}>
    <Reply size={15} className="shrink-0" aria-hidden="true" />
    <div className="min-w-0 flex-1">
      <p className="ai-reply-preview-title">Ответ на сообщение {target.role === 'assistant' ? 'ИИ' : 'пользователя'}</p>
      <p className="ai-reply-preview-text">{target.content.slice(0, compact ? 110 : 210)}</p>
      {target.fileNames.length || target.generatedDocumentId ? <p className="ai-reply-preview-files">📎 {target.fileNames.join(', ') || 'Документ'}{target.generatedDocumentId ? ' (файл ' + target.generatedDocumentId + ')' : ''}</p> : null}
    </div>
    {onDismiss ? <button type="button" onClick={onDismiss} className="ai-reply-dismiss" aria-label="Отменить ответ"><X size={16} /></button> : null}
  </div>;
}

export function AiReplyMessageBody({ content, renderBody }: { content: string; renderBody: (text: string) => ReactNode }) {
  const parsed = parseAiReply(content);
  if (!parsed) return <>{renderBody(content)}</>;
  return <><AiReplyPreview target={parsed.reply} compact /><div className="mt-1">{renderBody(parsed.text)}</div></>;
}
