import { createHash } from 'node:crypto';

// This pure snapshot builder is shared by the manual Telegram history viewer
// and the explicit AI-analysis endpoint. The preview shown in the browser is
// exactly the context later supplied to OpenAI, not some newly selected chat.
const MAX_CONTEXT_MESSAGES = 15;
const MAX_CONTEXT_TEXT_CHARS = 1200;

export type TelegramSafeHistoryMessage = {
  id: number;
  date: number;
  out: boolean;
  senderName: string;
  text: string;
  truncated: boolean;
  hasMedia: boolean;
};

export type TelegramAnalysisMessage = {
  id: number;
  date: number;
  speaker: 'Вы' | 'Собеседник';
  text: string;
  truncated: boolean;
  hasMedia: boolean;
};

export type TelegramAnalysisSnapshot = {
  fingerprint: string;
  messageCount: number;
  messages: TelegramAnalysisMessage[];
};

export function buildTelegramAnalysisSnapshot(
  dialogId: string,
  history: TelegramSafeHistoryMessage[]
): TelegramAnalysisSnapshot {
  const selected: TelegramAnalysisMessage[] = history.slice(-MAX_CONTEXT_MESSAGES).map((m) => ({
    id: m.id,
    date: m.date,
    speaker: m.out ? 'Вы' : 'Собеседник',
    text: m.text.slice(0, MAX_CONTEXT_TEXT_CHARS),
    truncated: m.truncated || m.text.length > MAX_CONTEXT_TEXT_CHARS,
    hasMedia: m.hasMedia
  }));
  const fingerprint = createHash('sha256').update(JSON.stringify({ dialogId, selected })).digest('hex');
  return { fingerprint, messageCount: selected.length, messages: selected };
}

export function telegramAnalysisContextText(snapshot: TelegramAnalysisSnapshot): string {
  return snapshot.messages.map((m, i) => {
    const time = m.date > 0 && Number.isFinite(m.date)
      ? new Date(m.date * 1000).toISOString()
      : 'время неизвестно';
    const body = m.text || (m.hasMedia ? '[вложение: содержимое не передано]' : '[нет текстового содержимого]');
    const cutoff = m.truncated ? ' [текст сообщения сокращён]' : '';
    return `${i + 1}. ${m.speaker} (${time}): ${body}${cutoff}`;
  }).join('\n');
}
