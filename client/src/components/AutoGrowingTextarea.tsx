import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

type AutoGrowingTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  maxHeight?: number;
};

/** A controlled textarea that grows with its content until it reaches a safe chat height. */
export function AutoGrowingTextarea({ maxHeight = 180, style, value, ...props }: AutoGrowingTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = '0px';
    // Reading scrollHeight triggers layout; do it once per draft change.
    const contentHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(contentHeight, maxHeight)}px`;
    textarea.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
  }, [maxHeight, value]);

  return <textarea {...props} ref={textareaRef} value={value} rows={1} style={{ ...style, overflowY: 'hidden' }} />;
}
