/** Display-only repair for an unfinished Markdown bold delimiter.
 * Used only during streaming; final messages retain their original text.
 */
export function prepareStreamingAiInlineMarkup(text: string): string {
  const prefix = text.endsWith('*') && !text.endsWith('**') ? text.slice(0, -1) : text;
  const boldMarkers = prefix.match(/\*\*/g)?.length ?? 0;
  if (boldMarkers % 2 === 0) return prefix;
  // An opening ** with no text after it must remain invisible until the next chunk.
  return prefix.endsWith('**') ? prefix.slice(0, -2) : prefix + '**';
}
