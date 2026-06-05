import { Bold, Heading1, Heading2, Italic, Underline, X } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { linkifyNoteHtml, noteValueToEditorHtml } from '../lib/notes';

type NoteFormat = 'plain' | 'h1' | 'h2' | 'bold' | 'underline' | 'italic';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
};

type FormatButton = {
  format: NoteFormat;
  title: string;
  menuLabel: string;
  icon: typeof Bold;
  tagName?: 'h1' | 'h2' | 'strong' | 'u' | 'em';
};

type SelectionMenuPosition = {
  top: number;
  left: number;
};

const NOTE_FORMAT_BUTTONS: FormatButton[] = [
  { format: 'plain', title: 'Обычный текст', menuLabel: 'Обычный', icon: X },
  { format: 'h1', title: 'Заголовок первого порядка', menuLabel: 'Заголовок 1', icon: Heading1, tagName: 'h1' },
  { format: 'h2', title: 'Заголовок второго порядка', menuLabel: 'Заголовок 2', icon: Heading2, tagName: 'h2' },
  { format: 'bold', title: 'Жирный', menuLabel: 'Жирный', icon: Bold, tagName: 'strong' },
  { format: 'underline', title: 'Подчёркнутый', menuLabel: 'Подчёркнутый', icon: Underline, tagName: 'u' },
  { format: 'italic', title: 'Курсив', menuLabel: 'Курсив', icon: Italic, tagName: 'em' }
];


function selectionBelongsToEditor(editor: HTMLDivElement, selection: Selection) {
  if (!selection.rangeCount || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer);
}

export function NotesEditor({ value, onChange, onClose }: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [selectionMenuPosition, setSelectionMenuPosition] = useState<SelectionMenuPosition | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextHtml = noteValueToEditorHtml(value);
    if (document.activeElement !== editor && editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
  }, [value]);

  useEffect(() => {
    const updateSelection = () => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      const nextHasSelection = Boolean(editor && selection && selectionBelongsToEditor(editor, selection));
      setHasSelection(nextHasSelection);

      if (!nextHasSelection || !selection?.rangeCount) {
        setSelectionMenuPosition(null);
        return;
      }

      const rect = selection.getRangeAt(0).getBoundingClientRect();
      const top = Math.max(12, rect.top - 52);
      const left = Math.min(window.innerWidth - 12, Math.max(12, rect.left + rect.width / 2));
      setSelectionMenuPosition({ top, left });
    };
    document.addEventListener('selectionchange', updateSelection);
    return () => document.removeEventListener('selectionchange', updateSelection);
  }, []);

  const syncValue = () => {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(linkifyNoteHtml(editor.innerHTML));
  };

  const applyFormat = (button: FormatButton) => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || !selectionBelongsToEditor(editor, selection)) return;

    editor.focus();
    if (button.format === 'plain') {
      document.execCommand('removeFormat');
      document.execCommand('formatBlock', false, '<div>');
      syncValue();
      setHasSelection(true);
      setSelectionMenuPosition(null);
      return;
    }

    if (!button.tagName) return;
    const range = selection.getRangeAt(0);
    const wrapper = document.createElement(button.tagName);
    wrapper.append(range.extractContents());
    range.insertNode(wrapper);
    selection.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(wrapper);
    selection.addRange(nextRange);
    syncValue();
    setHasSelection(true);
    setSelectionMenuPosition(null);
  };

  const handleEditorClick = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest('a');
    if (!link?.href) return;
    event.preventDefault();
    window.open(link.href, '_blank', 'noopener,noreferrer');
  };

  const handleEditorBlur = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextHtml = linkifyNoteHtml(editor.innerHTML);
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
    onChange(nextHtml);
  };

  return (
    <div className="notes-editor-backdrop fixed inset-0 z-[90] flex items-center justify-center p-4" onClick={onClose}>
      <section className="notes-editor-panel relative flex h-[min(82vh,680px)] w-full max-w-4xl flex-col rounded-3xl border shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="notes-editor-close absolute right-3 top-3 rounded-full p-2" onClick={onClose} title="Закрыть заметки" aria-label="Закрыть заметки">
          <X size={18} />
        </button>
        <div className="notes-editor-header flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 pr-14">
          <div>
            <h4 className="text-base font-semibold text-primary">Заметки</h4>
            <p className="text-xs text-muted">Форматирование применяется только к выделенному тексту.</p>
          </div>
          <div className="notes-editor-toolbar flex flex-wrap justify-end gap-2">
            {NOTE_FORMAT_BUTTONS.map((button) => {
              const Icon = button.icon;
              return (
                <button
                  key={button.format}
                  type="button"
                  className="notes-editor-tool inline-flex items-center justify-center rounded-full p-2 disabled:cursor-not-allowed disabled:opacity-45"
                  title={hasSelection ? button.title : `${button.title} — сначала выделите текст`}
                  aria-label={button.title}
                  disabled={!hasSelection}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyFormat(button)}
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </div>
        </div>
        {selectionMenuPosition ? (
          <div
            className="notes-editor-selection-menu fixed z-[95] flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-wrap justify-center gap-1 rounded-2xl border px-2 py-1.5 shadow-2xl"
            style={{ top: selectionMenuPosition.top, left: selectionMenuPosition.left }}
            onMouseDown={(event) => event.preventDefault()}
          >
            {NOTE_FORMAT_BUTTONS.map((button) => (
              <button
                key={`selection-${button.format}`}
                type="button"
                className="notes-editor-selection-menu-button rounded-full px-2.5 py-1 text-xs font-semibold"
                onMouseDown={(event) => event.preventDefault()}
                onTouchStart={(event) => {
                  event.preventDefault();
                  applyFormat(button);
                }}
                onClick={() => applyFormat(button)}
              >
                {button.menuLabel}
              </button>
            ))}
          </div>
        ) : null}
        <div className="notes-editor-toolbar-spacer h-6 shrink-0 border-b" aria-hidden="true" />
        <div
          ref={editorRef}
          className="notes-editor-content min-h-0 flex-1 overflow-y-auto p-5 text-sm leading-6 outline-none"
          contentEditable
          role="textbox"
          aria-multiline="true"
          data-placeholder="Пишите заметки, детали задачи, ссылки и план действий…"
          suppressContentEditableWarning
          onClick={handleEditorClick}
          onBlur={handleEditorBlur}
          onInput={syncValue}
        />
      </section>
    </div>
  );
}
