export type AiInlineLinkPart = { type: 'text' | 'link'; text: string; href?: string };

const URL_PATTERN = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"']+)/gi;
const TRAILING_PUNCTUATION = /[.,;!?:\])}]/;

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && value.length <= 2048;
  } catch {
    return false;
  }
}

/** Parse links in AI prose without ever interpreting response HTML. */
export function parseAiInlineLinks(text: string): AiInlineLinkPart[] {
  const parts: AiInlineLinkPart[] = [];
  let offset = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index;
    if (index > offset) parts.push({ type: 'text', text: text.slice(offset, index) });
    const isMarkdown = Boolean(match[2]);
    let href = match[2] ?? match[3];
    let suffix = '';
    if (!isMarkdown) {
      while (href.length > 0 && TRAILING_PUNCTUATION.test(href[href.length - 1])) {
        const char = href[href.length - 1];
        if (char === ')' && (href.match(/\(/g)?.length ?? 0) >= (href.match(/\)/g)?.length ?? 0)) break;
        suffix = char + suffix;
        href = href.slice(0, -1);
      }
    }
    if (isSafeExternalUrl(href)) parts.push({ type: 'link', text: isMarkdown ? match[1] : href, href });
    else parts.push({ type: 'text', text: isMarkdown ? match[0] : href });
    if (suffix) parts.push({ type: 'text', text: suffix });
    offset = index + match[0].length;
  }
  if (offset < text.length) parts.push({ type: 'text', text: text.slice(offset) });
  return parts;
}
