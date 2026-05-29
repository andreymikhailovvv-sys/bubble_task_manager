import { Fragment, useMemo, useState, type MouseEvent, type ReactNode } from 'react';

type Props = {
  text?: string | null;
  className?: string;
  fallback?: string;
  stopPropagationOnLinkClick?: boolean;
  enableCommentAnnotations?: boolean;
};

type TextPart = {
  type: 'text';
  value: string;
};

type CommentPart = {
  type: 'comment';
  id: string;
  fragment: string;
  comment: string;
};

type ParsedPart = TextPart | CommentPart;

const LINK_PATTERN = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
const COMMENT_ANNOTATION_PATTERN = /\[([^\]\n]+)]\{comment:([^}\n]+)}/gi;

function normalizeHref(raw: string) {
  return raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
}

function parseCommentAnnotations(value: string): ParsedPart[] {
  const parts: ParsedPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  COMMENT_ANNOTATION_PATTERN.lastIndex = 0;
  while ((match = COMMENT_ANNOTATION_PATTERN.exec(value)) !== null) {
    const [fullMatch, fragment, comment] = match;
    const textBefore = value.slice(lastIndex, match.index);
    if (textBefore) parts.push({ type: 'text', value: textBefore });

    const normalizedFragment = fragment.trim();
    const normalizedComment = comment.trim();
    if (normalizedFragment && normalizedComment) {
      parts.push({
        type: 'comment',
        id: `comment-${match.index}-${fullMatch.length}`,
        fragment: normalizedFragment,
        comment: normalizedComment
      });
    } else {
      parts.push({ type: 'text', value: fullMatch });
    }
    lastIndex = match.index + fullMatch.length;
  }

  const tail = value.slice(lastIndex);
  if (tail) parts.push({ type: 'text', value: tail });
  return parts;
}

function renderLinkifiedInline(
  value: string,
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void,
  keyPrefix: string
): ReactNode {
  const parts = value.split(LINK_PATTERN);

  return parts.map((part, index) => {
    if (!part) return null;
    if (!/^(https?:\/\/|www\.)/i.test(part)) {
      return <span key={`${keyPrefix}-txt-${index}`}>{part}</span>;
    }

    return (
      <a
        key={`${keyPrefix}-lnk-${index}`}
        href={normalizeHref(part)}
        target="_blank"
        rel="noreferrer noopener"
        className="underline decoration-cyan-300/80 underline-offset-2 hover:text-cyan-200"
        onClick={onClick}
      >
        {part}
      </a>
    );
  });
}

export function LinkifiedText({ text, className, fallback = '', stopPropagationOnLinkClick = false, enableCommentAnnotations = false }: Props) {
  const value = text?.trim() || fallback;
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const annotatedParts = useMemo(() => enableCommentAnnotations ? parseCommentAnnotations(value) : [], [enableCommentAnnotations, value]);
  if (!value) return null;

  const onLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (stopPropagationOnLinkClick) {
      event.stopPropagation();
    }
  };

  if (!enableCommentAnnotations || annotatedParts.every((part) => part.type === 'text')) {
    return <span className={className}>{renderLinkifiedInline(value, onLinkClick, 'plain')}</span>;
  }

  return (
    <span className={`grid gap-x-3 gap-y-1 align-top md:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)] ${className ?? ''}`}>
      {annotatedParts.map((part, index) => {
        if (part.type === 'text') {
          return (
            <span key={`annotated-text-${index}`} className="md:col-span-2">
              {renderLinkifiedInline(part.value, onLinkClick, `annotated-text-${index}`)}
            </span>
          );
        }

        const isActive = activeCommentId === part.id;
        const highlightClassName = isActive
          ? 'bg-yellow-200 text-slate-950 ring-2 ring-yellow-100 shadow-[0_0_0_4px_rgba(250,204,21,0.2)]'
          : 'bg-yellow-300/80 text-slate-950';
        const commentClassName = isActive
          ? 'border-yellow-200 bg-yellow-200/25 text-yellow-50 shadow-lg shadow-yellow-500/10'
          : 'border-yellow-300/45 bg-yellow-300/10 text-yellow-100 hover:bg-yellow-300/15';

        return (
          <Fragment key={part.id}>
            <button
              type="button"
              className={`rounded px-1 text-left transition ${highlightClassName}`}
              onClick={(event) => {
                if (stopPropagationOnLinkClick) event.stopPropagation();
                setActiveCommentId((current) => current === part.id ? null : part.id);
              }}
            >
              {renderLinkifiedInline(part.fragment, onLinkClick, `annotated-fragment-${index}`)}
            </button>
            <button
              type="button"
              className={`rounded-lg border px-2 py-1 text-left text-xs leading-snug transition ${commentClassName}`}
              onClick={(event) => {
                if (stopPropagationOnLinkClick) event.stopPropagation();
                setActiveCommentId((current) => current === part.id ? null : part.id);
              }}
            >
              {renderLinkifiedInline(part.comment, onLinkClick, `annotated-comment-${index}`)}
            </button>
          </Fragment>
        );
      })}
    </span>
  );
}
