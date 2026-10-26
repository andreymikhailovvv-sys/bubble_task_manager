/**
 * One plain-text format shared by Quick AI, Telegram, Android and browser.
 * The first line must be actionable when the model follows the prompt.
 * Legacy prose still produces a neutral, task-specific headline.
 */
export function monitoringHeadline(answer: string, taskTitle: string): { headline: string; body: string } {
  const cleaned = answer.trim().replace(/^\s{0,3}#{1,3}\s+/, '').replace(/^\*\*(.*?)\*\*/, '$1');
  const lines = cleaned.split(/\r?\n/);
  const first = (lines[0] ?? '').trim().replace(/^["«]|["»]$/g, '');
  const suitable = first.length >= 8 && first.length <= 125 &&
    !/^мониторинг|^напоминание по триггеру|^задача:/i.test(first) &&
    lines.length > 1;
  const headline = suitable ? first : `Пора вернуться к задаче «${taskTitle.slice(0, 65)}»`;
  const body = suitable ? lines.slice(1).join('\n').trim() : answer.trim();
  return { headline: headline.slice(0, 125), body: body.slice(0, 4200) };
}

export function formatMonitoringAlert(taskTitle: string, answer: string) {
  const { headline, body } = monitoringHeadline(answer, taskTitle);
  const context = `Мониторинг задачи «${taskTitle.trim().slice(0, 150)}»`;
  return {
    headline,
    context,
    body,
    content: [headline, context, '', body].filter((part, i) => Boolean(part) || i === 2).join('\n')
  };
}
