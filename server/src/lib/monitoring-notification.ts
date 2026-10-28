/**
 * Monitoring messages keep the complete AI answer in chats. All notification
 * channels receive only two lines: the model's actionable headline and task.
 * The explicit prefix makes parsing deterministic; older first-line answers
 * are still supported for already-generated messages.
 */
const MAX_HEADLINE_LENGTH = 90;

function shortenHeadline(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim().replace(/^["«]|["»]$/g, '');
  if (normalized.length <= MAX_HEADLINE_LENGTH) return normalized;
  const clipped = normalized.slice(0, MAX_HEADLINE_LENGTH - 1);
  const wordBoundary = clipped.lastIndexOf(' ');
  return (wordBoundary > 30 ? clipped.slice(0, wordBoundary) : clipped).trimEnd() + '…';
}

export function monitoringHeadline(answer: string, taskTitle: string): { headline: string; body: string } {
  const cleaned = answer.trim().replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const breakAt = cleaned.indexOf('\n');
  const firstLine = (breakAt >= 0 ? cleaned.slice(0, breakAt) : cleaned)
    .trim().replace(/^#{1,3}\s+/, '').replace(/^\*\*(.*?)\*\*$/, '$1');
  const explicit = firstLine.match(/^(?:ЗАГОЛОВОК|HEADLINE)\s*[:：]\s*(.*)$/i);
  const plain = explicit ? explicit[1].trim() : firstLine;
  // Legacy single-paragraph answers: extract the first actual sentence.
  const firstSentence = explicit || breakAt >= 0 ? null : plain.match(/^.{8,}?[.!?](?=\s|$)/u)?.[0];
  const candidate = firstSentence ?? plain;
  const headline = shortenHeadline(candidate) || shortenHeadline(taskTitle);
  const body = (breakAt >= 0
    ? cleaned.slice(breakAt + 1)
    : firstSentence ? plain.slice(firstSentence.length) : '')
    .trim().replace(/^СООБЩЕНИЕ\s*[:：]\s*/i, '');
  return { headline, body: body.slice(0, 4200) };
}

export function formatMonitoringAlert(taskTitle: string, answer: string) {
  const { headline, body } = monitoringHeadline(answer, taskTitle);
  const context = `✅Мониторинг задачи «${taskTitle.trim().slice(0, 150)}»`;
  return {
    headline,
    context,
    body,
    // Persisted system notification, browser OS alert, Android and Telegram.
    content: [headline, context].join('\n'),
    // Full message appears only in the task and Quick AI conversations.
    message: [headline, body].filter(Boolean).join('\n\n')
  };
}
