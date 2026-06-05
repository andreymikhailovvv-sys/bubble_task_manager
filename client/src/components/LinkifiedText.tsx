import type { MouseEvent, ReactNode } from 'react';
import { isFormattedNoteHtml, normalizeNoteHref, sanitizeNoteHtml } from '../lib/notes';

type Props = {
  text?: string | null;
  className?: string;
  fallback?: string;
  stopPropagationOnLinkClick?: boolean;
};

const LINK_PATTERN = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
const SUPPORTED_NOTE_TAGS = new Set(['A', 'B', 'STRONG', 'I', 'EM', 'U', 'H1', 'H2', 'P', 'DIV', 'BR']);

function normalizeHref(raw: string) {
  return normalizeNoteHref(raw);
}

function linkifyPlainText(value: string, onClick: (event: MouseEvent<HTMLAnchorElement>) => void, keyPrefix: string): ReactNode[] {
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

function renderFormattedNode(node: ChildNode, onClick: (event: MouseEvent<HTMLAnchorElement>) => void, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return linkifyPlainText(node.textContent ?? '', onClick, key);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const element = node as Element;
  if (!SUPPORTED_NOTE_TAGS.has(element.tagName)) {
    return Array.from(element.childNodes).map((child, index) => renderFormattedNode(child, onClick, `${key}-${index}`));
  }

  const children = Array.from(element.childNodes).map((child, index) => renderFormattedNode(child, onClick, `${key}-${index}`));

  switch (element.tagName) {
    case 'B':
    case 'STRONG':
      return <strong key={key}>{children}</strong>;
    case 'I':
    case 'EM':
      return <em key={key}>{children}</em>;
    case 'U':
      return <u key={key}>{children}</u>;
    case 'H1':
      return <span key={key} className="note-formatted-h1">{children}</span>;
    case 'H2':
      return <span key={key} className="note-formatted-h2">{children}</span>;
    case 'P':
    case 'DIV':
      return <span key={key} className="note-formatted-block">{children}</span>;
    case 'A': {
      const href = element.getAttribute('href') ?? '';
      return (
        <a key={key} href={href} target="_blank" rel="noreferrer noopener" className="underline decoration-cyan-300/80 underline-offset-2 hover:text-cyan-200" onClick={onClick}>
          {children}
        </a>
      );
    }
    case 'BR':
      return <br key={key} />;
    default:
      return children;
  }
}

function renderFormattedText(value: string, onClick: (event: MouseEvent<HTMLAnchorElement>) => void) {
  if (typeof document === 'undefined') return [value];

  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeNoteHtml(value);
  return Array.from(wrapper.childNodes).map((node, index) => renderFormattedNode(node, onClick, `fmt-${index}`));
}

function linkifyPlainText(value: string, onClick: (event: MouseEvent<HTMLAnchorElement>) => void, keyPrefix: string): ReactNode[] {
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

function renderFormattedNode(node: ChildNode, onClick: (event: MouseEvent<HTMLAnchorElement>) => void, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return linkifyPlainText(node.textContent ?? '', onClick, key);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const element = node as Element;
  if (!SUPPORTED_NOTE_TAGS.has(element.tagName)) {
    return Array.from(element.childNodes).map((child, index) => renderFormattedNode(child, onClick, `${key}-${index}`));
  }

  const children = Array.from(element.childNodes).map((child, index) => renderFormattedNode(child, onClick, `${key}-${index}`));

  switch (element.tagName) {
    case 'B':
    case 'STRONG':
      return <strong key={key}>{children}</strong>;
    case 'I':
    case 'EM':
      return <em key={key}>{children}</em>;
    case 'U':
      return <u key={key}>{children}</u>;
    case 'H1':
      return <span key={key} className="note-formatted-h1">{children}</span>;
    case 'H2':
      return <span key={key} className="note-formatted-h2">{children}</span>;
    case 'P':
    case 'DIV':
      return <span key={key} className="note-formatted-block">{children}</span>;
    case 'BR':
      return <br key={key} />;
    default:
      return children;
  }
}

function renderFormattedText(value: string, onClick: (event: MouseEvent<HTMLAnchorElement>) => void) {
  if (typeof document === 'undefined') return [value];

  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeNoteHtml(value);
  return Array.from(wrapper.childNodes).map((node, index) => renderFormattedNode(node, onClick, `fmt-${index}`));
}

export function LinkifiedText({ text, className, fallback = '', stopPropagationOnLinkClick = false }: Props) {
  const value = text?.trim() || fallback;
  if (!value) return null;

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (stopPropagationOnLinkClick) {
      event.stopPropagation();
    }
  };

  const content = isFormattedNoteHtml(value)
    ? renderFormattedText(value, onClick)
    : linkifyPlainText(value, onClick, 'plain');

  return <span className={className}>{content}</span>;
}
