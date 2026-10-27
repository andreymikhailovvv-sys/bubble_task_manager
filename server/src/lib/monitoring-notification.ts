/**
 * One plain-text format shared by Quick AI, Telegram, Android and browser.
 * The first line must be actionable when the model follows the prompt.
 * Legacy prose still produces a neutral, task-specific headline.
 */
export function monitoringHeadline(answer: string, taskTitle: string): { headline: string; body: string } {
  const cleaned = answer.trim().replace(/^\s{0,3}#{1,3}\s+/, '').replace(/^\*\*(.*?)\*\*/, '$1');
  const firstBreak = cleaned.indexOf('\n');
  const firstParagraph = (firstBreak >= 0 ? cleaned.slice(0, firstBreak) : cleaned).trim();
  // The model owns the headline. If it responds in a single paragraph,
  // extract its own first sentence. Never invent repetitive server headlines.
  const sentence = firstParagraph.match(/^.{8,125}?[.!?](?=\s|$)/u)?.[0];
  const candidate = sentence ?? firstParagraph;
  const headline = candidate.slice(0, 125).trim().replace(/^["«]|["»]$/g, '');
  const remainder = cleaned.slice(firstBreak >= 0 ? firstBreak + 1 : sentence ? sentence.length : candidate.length).trim();
  return { headline: headline || taskTitle.slice(0, 125), body: remainder.slice(0, 4200) };
}

export function formatMonitoringAlert(taskTitle: string, answer: string) {
  const { headline, body } = monitoringHeadline(answer, taskTitle);
  const context = `✔️Мониторинг задачи «${taskTitle.trim().slice(0, 150)}»`;
  return {
    headline,
    context,
    body,
    content: [headline, context, '', body].filter((part, i) => Boolean(part) || i === 2).join('\n')
  };
}
