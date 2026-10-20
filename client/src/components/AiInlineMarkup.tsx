import { Fragment } from 'react';
import { parseAiInlineLinks } from '../lib/aiInlineLinks';

const BOLD_PATTERN = /(\*\*[\s\S]+?\*\*)/g;

export function AiInlineMarkup({ content, strongClassName = 'font-semibold' }: { content: string; strongClassName?: string }) {
  return <>{content.split(BOLD_PATTERN).map((part, index) => {
    if (!part) return null;
    const bold = part.startsWith('**') && part.endsWith('**') && part.length > 4;
    const text = bold ? part.slice(2, -2) : part;
    const elements = parseAiInlineLinks(text).map((item, partIndex) => item.type === 'link'
      ? <a key={partIndex} href={item.href} target="_blank" rel="noopener noreferrer"
          className="underline underline-offset-2 break-words [overflow-wrap:anywhere] hover:opacity-80">{item.text}</a>
      : <Fragment key={partIndex}>{item.text}</Fragment>);
    return bold ? <strong key={index} className={strongClassName}>{elements}</strong> : <Fragment key={index}>{elements}</Fragment>;
  })}</>;
}
