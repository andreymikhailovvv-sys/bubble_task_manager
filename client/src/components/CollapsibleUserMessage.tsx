import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

type Props = {
  children: ReactNode;
  className?: string;
};

/** Keeps long user prompts compact while leaving short chat messages untouched. */
export function CollapsibleUserMessage({ children, className = '' }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canCollapse, setCanCollapse] = useState(false);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const measure = () => {
      if (!expanded) setCanCollapse(content.scrollHeight > content.clientHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [children, expanded]);

  return (
    <div className={`collapsible-user-message ${expanded ? 'is-expanded' : ''} ${canCollapse ? 'is-collapsible' : ''} ${className}`}>
      <div ref={contentRef} className="collapsible-user-message-content">{children}</div>
      {canCollapse || expanded ? (
        <button
          type="button"
          className="collapsible-user-message-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <>Свернуть <ChevronUp size={15} /></> : <>Развернуть <ChevronDown size={15} /></>}
        </button>
      ) : null}
    </div>
  );
}
