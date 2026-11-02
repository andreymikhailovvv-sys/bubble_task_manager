import { AiInlineMarkup } from './AiInlineMarkup';
import { renderAiContentBlocks } from './AiCodeBlocks';

/** A markdown delimiter may be split between two network frames.
 * Format the complete prefix seen so far rather than showing raw ** markers.
 * Only temporary, uncommitted text uses this preview normalization.
 */
export function prepareStreamingAiInlineMarkup(text: string): string {
  // Hide an unfinished opening or closing asterisk until the next chunk arrives.
  const prefix = text.endsWith('*') && !text.endsWith('**') ? text.slice(0, -1) : text;
  const boldMarkers = prefix.match(/\*\*/g)?.length ?? 0;
  return boldMarkers % 2 ? prefix + '**' : prefix;
}

export function AiStreamingMessageBody({ content }: { content: string }) {
  return <>{renderAiContentBlocks(content, (part, key) => (
    <div key={key} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      {part.split(/\r?\n/).map((line, index) => (
        <div key={index} className="min-h-[1em]">
          <AiInlineMarkup content={prepareStreamingAiInlineMarkup(line)} strongClassName="ai-inline-strong" />
        </div>
      ))}
    </div>
  ))}</>;
}
