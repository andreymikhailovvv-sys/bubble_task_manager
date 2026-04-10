import type { MouseEvent } from 'react';

type Props = {
  text?: string | null;
  className?: string;
  fallback?: string;
  stopPropagationOnLinkClick?: boolean;
};

const LINK_PATTERN = /((?:https?:\/\/|www\.)[^\s<]+)/gi;

function normalizeHref(raw: string) {
  return raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
}

export function LinkifiedText({ text, className, fallback = '', stopPropagationOnLinkClick = false }: Props) {
  const value = text?.trim() || fallback;
  if (!value) return null;

  const parts = value.split(LINK_PATTERN);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (stopPropagationOnLinkClick) {
      event.stopPropagation();
    }
  };

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (!part) return null;
        if (!/^(https?:\/\/|www\.)/i.test(part)) {
          return <span key={`txt-${index}`}>{part}</span>;
        }

        return (
          <a
            key={`lnk-${index}`}
            href={normalizeHref(part)}
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-cyan-300/80 underline-offset-2 hover:text-cyan-200"
            onClick={onClick}
          >
            {part}
          </a>
        );
      })}
    </span>
  );
}
