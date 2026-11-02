/** Display-only repair for an unfinished Markdown bold delimiter.
 * Used only during streaming; final messages retain their original text.
 */
export function prepareStreamingAiInlineMarkup(text: string): string {
  const prefix = text.endsWith('*') && !text.endsWith('**') ? text.slice(0, -1) : text;
  const boldMarkers = prefix.match(/\*\*/g)?.length ?? 0;
  return boldMarkers % 2 ? prefix + '**' : prefix;
}
