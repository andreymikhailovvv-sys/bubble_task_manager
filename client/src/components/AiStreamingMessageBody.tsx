import { AiInlineMarkup } from './AiInlineMarkup';
import { prepareStreamingAiInlineMarkup } from '../lib/streamingAiMarkdown';
import { renderAiContentBlocks } from './AiCodeBlocks';

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
