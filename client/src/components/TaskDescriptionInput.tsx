import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { noteHtmlToPlainText } from '../lib/notes';
import { LinkifiedText } from './LinkifiedText';

type Props = {
  value?: string | null;
  onChange: (nextValue: string) => void;
  className?: string;
  placeholder?: string;
};

/**
 * Preserve stored formatted notes in preview mode. Switching into inline
 * editing alone must not overwrite the original HTML with plain text.
 */
export function TaskDescriptionInput({ value, onChange, className = '', placeholder = 'Введите описание' }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const description = value ?? '';

  useEffect(() => {
    if (isEditing) textareaRef.current?.focus();
  }, [isEditing]);

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        className={className}
        placeholder={placeholder}
        value={noteHtmlToPlainText(description, { trimEnd: false })}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setIsEditing(false)}
      />
    );
  }

  const startEditing = () => setIsEditing(true);
  const handlePreviewClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('a')) return;
    startEditing();
  };
  const handlePreviewKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      startEditing();
    }
  };

  return (
    <div
      className={`task-description-preview ${className}`}
      role="textbox"
      aria-label={placeholder}
      aria-readonly="true"
      aria-multiline="true"
      tabIndex={0}
      onClick={handlePreviewClick}
      onKeyDown={handlePreviewKeyDown}
    >
      {description.trim()
        ? <LinkifiedText text={description} stopPropagationOnLinkClick />
        : <span className="task-description-placeholder">{placeholder}</span>}
    </div>
  );
}
