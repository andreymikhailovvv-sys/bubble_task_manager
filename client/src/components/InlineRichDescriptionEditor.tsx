import { useEffect, useLayoutEffect, useRef, type ClipboardEvent, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react';
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
  const pendingHtmlRef = useRef<string | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A pending edit must always use the latest callback, even when unmounting.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor === document.activeElement || editor.contains(document.activeElement)) return;
    const normalized = noteValueToEditorHtml(value ?? '');
    if (editor.innerHTML !== normalized) editor.innerHTML = normalized;
    lastEmittedRef.current = normalized;
  }, [value]);

  const emitSanitized = (rawHtml: string) => {
    // Never pass unsanitized contentEditable HTML to React or autosave.
    const html = linkifyNoteHtml(rawHtml);
    if (html !== lastEmittedRef.current) {
      lastEmittedRef.current = html;
      onChangeRef.current(html);
    }
    return html;
  };

  const flushPending = () => {
    if (pendingTimerRef.current !== null) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    const rawHtml = pendingHtmlRef.current;
    pendingHtmlRef.current = null;
    return rawHtml === null ? null : emitSanitized(rawHtml);
  };

  const emitChange = () => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    // Native contentEditable updates immediately. Coalesce expensive HTML
    // sanitation and the entire planner's React render during continuous input.
    pendingHtmlRef.current = editor.innerHTML;
    if (pendingTimerRef.current !== null) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      flushPending();
    }, 180);
  };

  useEffect(() => {
    // Commit pending text *before* outside controls can close/save the task,
    // including non-focusable buttons and Escape-based dismissal.
    const onOutsidePointerDown = (event: PointerEvent) => {
      if (pendingHtmlRef.current !== null && event.target instanceof Node
        && !editorRef.current?.contains(event.target)) flushPending();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && pendingHtmlRef.current !== null) flushPending();
    };
    document.addEventListener('pointerdown', onOutsidePointerDown, true);
    document.addEventListener('keydown', onEscape, true);
    return () => {
      document.removeEventListener('pointerdown', onOutsidePointerDown, true);
      document.removeEventListener('keydown', onEscape, true);
      // Do not discard a final keystroke if the focused editor is unmounted.
      flushPending();
    };
  }, []);

  const handleBlur = () => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    // Flush immediately on blur. Only then normalize the DOM, preserving caret
    // and IME composition throughout typing, as in the original editor.
    const html = flushPending() ?? emitSanitized(editor.innerHTML);
    if (editor.innerHTML !== html) editor.innerHTML = html;
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

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
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
