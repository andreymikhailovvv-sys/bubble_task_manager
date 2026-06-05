import { Bold, Heading1, Heading2, Italic, Underline, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { noteValueToEditorHtml, sanitizeNoteHtml } from '../lib/notes';

type NoteFormat = 'h1' | 'h2' | 'bold' | 'underline' | 'italic';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
};

const NOTE_FORMAT_BUTTONS: Array<{ format: NoteFormat; label: string; title: string; icon: typeof Bold; command: string; value?: string }> = [
  { format: 'h1', label: 'H1', title: 'Заголовок первого порядка', icon: Heading1, command: 'formatBlock', value: '<h1>' },
  { format: 'h2', label: 'H2', title: 'Заголовок второго порядка', icon: Heading2, command: 'formatBlock', value: '<h2>' },
  { format: 'bold', label: 'B', title: 'Жирный', icon: Bold, command: 'bold' },
  { format: 'underline', label: 'U', title: 'Подчёркнутый', icon: Underline, command: 'underline' },
  { format: 'italic', label: 'I', title: 'Курсив', icon: Italic, command: 'italic' }
];

function selectionBelongsToEditor(editor: HTMLDivElement, selection: Selection) {
  if (!selection.rangeCount || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer);
}

export function NotesEditor({ value, onChange, onClose }: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [hasSelection, setHasSelection] = useState(false);

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
      setHasSelection(Boolean(editor && selection && selectionBelongsToEditor(editor, selection)));
    };
    document.addEventListener('selectionchange', updateSelection);
    return () => document.removeEventListener('selectionchange', updateSelection);
  }, []);

  const syncValue = () => {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(sanitizeNoteHtml(editor.innerHTML));
  };

  const applyFormat = (button: (typeof NOTE_FORMAT_BUTTONS)[number]) => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || !selectionBelongsToEditor(editor, selection)) return;

    editor.focus();
    document.execCommand(button.command, false, button.value);
    syncValue();
    setHasSelection(false);
  };

  return (
    <div className="notes-editor-backdrop fixed inset-0 z-[90] flex items-center justify-center p-4" onClick={onClose}>
      <section className="notes-editor-panel flex h-[min(82vh,680px)] w-full max-w-4xl flex-col rounded-3xl border shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="notes-editor-header flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h4 className="text-base font-semibold text-primary">Заметки</h4>
            <p className="text-xs text-muted">Форматирование применяется только к выделенному тексту.</p>
          </div>
          <button type="button" className="notes-editor-close rounded-full p-2" onClick={onClose} title="Закрыть заметки">
            <X size={18} />
          </button>
        </div>
        <div className="notes-editor-toolbar flex flex-wrap gap-2 border-b px-4 py-3">
          {NOTE_FORMAT_BUTTONS.map((button) => {
            const Icon = button.icon;
            return (
              <button
                key={button.format}
                type="button"
                className="notes-editor-tool inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45"
                title={hasSelection ? button.title : `${button.title} — сначала выделите текст`}
                disabled={!hasSelection}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyFormat(button)}
              >
                <Icon size={15} />
                <span>{button.label}</span>
              </button>
            );
          })}
        </div>
        <div
          ref={editorRef}
          className="notes-editor-content min-h-0 flex-1 overflow-y-auto p-5 text-sm leading-6 outline-none"
          contentEditable
          role="textbox"
          aria-multiline="true"
          data-placeholder="Пишите заметки, детали задачи, ссылки и план действий…"
          suppressContentEditableWarning
          onInput={syncValue}
        />
      </section>
    </div>
  );
}
