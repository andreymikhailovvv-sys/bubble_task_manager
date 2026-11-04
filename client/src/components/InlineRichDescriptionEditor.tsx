import { useLayoutEffect, useRef, type ClipboardEvent, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { linkifyNoteHtml, noteValueToEditorHtml } from '../lib/notes';

type Props = {
  value?: string | null;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
};

/**
 * Compact notes editor for the website. Unlike the old preview/textarea switch,
 * this keeps one editable DOM tree so mouse clicks place the native caret
 * precisely and existing headings, lists, links and emphasis stay on screen.
 * React only reconciles HTML when the editor is NOT focused. Replacing it on
 * every keystroke would destroy the user's selection and IME composition.
 */
export function InlineRichDescriptionEditor({
  value, onChange, className = '', placeholder = 'Введите описание', readOnly = false
}: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastEmittedRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor === document.activeElement || editor.contains(document.activeElement)) return;
    const normalized = noteValueToEditorHtml(value ?? '');
    if (editor.innerHTML !== normalized) editor.innerHTML = normalized;
    lastEmittedRef.current = normalized;
  }, [value]);

  const emitChange = () => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    const html = linkifyNoteHtml(editor.innerHTML);
    if (html !== lastEmittedRef.current) {
      lastEmittedRef.current = html;
      onChange(html);
    }
  };

  const handleBlur = () => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    // Sanitize and linkify only AFTER focus leaves, not during typing.
    // While editing, retaining the DOM tree is essential for caret stability.
    const html = linkifyNoteHtml(editor.innerHTML);
    if (editor.innerHTML !== html) editor.innerHTML = html;
    if (html !== lastEmittedRef.current) {
      lastEmittedRef.current = html;
      onChange(html);
    }
  };

  const pastePlainText = (event: ClipboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    event.preventDefault();
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    // Paste as text only. Rich formatting remains available in NotesEditor.
    const text = event.clipboardData.getData('text/plain');
    const fragment = document.createDocumentFragment();
    text.replace(/\r\n?/g, '\n').split('\n').forEach((line, index) => {
      if (index) fragment.appendChild(document.createElement('br'));
      fragment.appendChild(document.createTextNode(line));
    });
    const lastNode = fragment.lastChild;
    range.deleteContents();
    range.insertNode(fragment);
    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    emitChange();
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    const link = target.closest('a');
    if (!link) return;
    // A normal click places the caret naturally, even inside a URL.
    // Modifier-click still lets the user open the link deliberately.
    event.preventDefault();
    if ((event.ctrlKey || event.metaKey) && link instanceof HTMLAnchorElement && link.href) {
      window.open(link.href, '_blank', 'noopener,noreferrer');
    }
  };

  const preventRichDrop = (event: DragEvent<HTMLDivElement>) => {
    if (readOnly) return;
    // Browser HTML/file drop may insert unsanitized markup; use NotesEditor for rich input.
    event.preventDefault();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
      event.preventDefault();
    }
  };

  return (
    <div
      ref={editorRef}
      className={`task-description-preview task-description-inline-rich ${className}`}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-label={placeholder}
      aria-multiline="true"
      aria-readonly={readOnly}
      data-placeholder={placeholder}
      onInput={emitChange}
      onCompositionEnd={emitChange}
      onBlur={handleBlur}
      onPaste={pastePlainText}
      onDrop={preventRichDrop}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    />
  );
}
