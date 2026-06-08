import { Bold, CheckSquare, Heading1, Heading2, Italic, ListChecks, ListOrdered, List as ListIcon, Underline, X } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { linkifyNoteHtml, noteValueToEditorHtml } from '../lib/notes';

type NoteFormat = 'plain' | 'h1' | 'h2' | 'bold' | 'underline' | 'italic';
type NoteListFormat = 'ordered' | 'unordered' | 'checklist';

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

const NOTE_LIST_BUTTONS: Array<{ format: NoteListFormat; title: string; icon: typeof ListIcon }> = [
  { format: 'unordered', title: 'Список точками', icon: ListIcon },
  { format: 'ordered', title: 'Список цифрами', icon: ListOrdered }
];

function selectionBelongsToEditor(editor: HTMLDivElement, selection: Selection) {
  if (!selection.rangeCount || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer);
}

function getSelectedLines(range: Range) {
  const text = range.toString().replace(/\u00a0/g, ' ').trim();
  return (text ? text.split(/\n+/) : ['']).map((line) => line.trim()).filter(Boolean);
}

export function NotesEditor({ value, onChange, onClose }: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [selectionMenuPosition, setSelectionMenuPosition] = useState<SelectionMenuPosition | null>(null);
  const [isListMenuOpen, setIsListMenuOpen] = useState(false);

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
        setIsListMenuOpen(false);
        return;
      }

      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      const top = Math.max(12, rect.top - 52);
      const left = Math.min(window.innerWidth - 12, Math.max(12, rect.left + rect.width / 2));
      setSelectionMenuPosition({ top, left });
    };
    document.addEventListener('selectionchange', updateSelection);
    return () => document.removeEventListener('selectionchange', updateSelection);
  }, []);

  const getSerializedEditorHtml = () => {
    const editor = editorRef.current;
    if (!editor) return '';
    editor.querySelectorAll<HTMLInputElement>('.note-checklist input[type="checkbox"]').forEach((checkbox) => {
      checkbox.toggleAttribute('checked', checkbox.checked);
      checkbox.closest('.note-checkbox-item')?.classList.toggle('note-checkbox-item-checked', checkbox.checked);
    });
    return editor.innerHTML;
  };

  const syncValue = () => {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(linkifyNoteHtml(getSerializedEditorHtml()));
  };

  const restoreSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const range = savedRangeRef.current;
    if (!editor || !selection || !range || !editor.contains(range.commonAncestorContainer)) return null;

    editor.focus();
    selection.removeAllRanges();
    selection.addRange(range);
    return range;
  };

  const finishFormatting = () => {
    syncValue();
    setHasSelection(true);
    setSelectionMenuPosition(null);
    setIsListMenuOpen(false);
  };

  const applyFormat = (button: FormatButton) => {
    const editor = editorRef.current;
    const range = restoreSelection();
    if (!editor || !range) return;

    if (button.format === 'plain') {
      document.execCommand('removeFormat');
      document.execCommand('formatBlock', false, '<div>');
      finishFormatting();
      return;
    }

    if (!button.tagName) return;
    const wrapper = document.createElement(button.tagName);
    wrapper.append(range.extractContents());
    range.insertNode(wrapper);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(wrapper);
    selection?.addRange(nextRange);
    savedRangeRef.current = nextRange.cloneRange();
    finishFormatting();
  };

  const applyListFormat = (format: NoteListFormat) => {
    const range = restoreSelection();
    if (!range) return;

    const selectedLines = getSelectedLines(range);
    if (selectedLines.length === 0) return;

    const wrapper = document.createElement(format === 'ordered' ? 'ol' : 'ul');
    wrapper.className = format === 'ordered' ? 'note-list note-list-ordered' : 'note-list note-list-unordered';
    selectedLines.forEach((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      wrapper.append(item);
    });

    range.deleteContents();
    range.insertNode(wrapper);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(wrapper);
    selection?.addRange(nextRange);
    savedRangeRef.current = nextRange.cloneRange();
    finishFormatting();
  };

  const applyChecklistFormat = () => {
    const range = restoreSelection();
    if (!range) return;

    const selectedLines = getSelectedLines(range);
    if (selectedLines.length === 0) return;

    const list = document.createElement('div');
    list.className = 'note-checklist';
    selectedLines.forEach((line) => {
      const label = document.createElement('label');
      label.className = 'note-checkbox-item';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      const span = document.createElement('span');
      span.textContent = line;
      label.append(checkbox, span);
      list.append(label);
    });

    range.deleteContents();
    range.insertNode(list);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(list);
    selection?.addRange(nextRange);
    savedRangeRef.current = nextRange.cloneRange();
    finishFormatting();
  };

  const handleEditorClick = (event: MouseEvent<HTMLDivElement>) => {
    const checkbox = (event.target as HTMLElement).closest<HTMLInputElement>('.note-checklist input[type="checkbox"]');
    if (checkbox) {
      const item = checkbox.closest('.note-checkbox-item');
      item?.classList.toggle('note-checkbox-item-checked', checkbox.checked);
      window.setTimeout(syncValue, 0);
      return;
    }

    const link = (event.target as HTMLElement).closest('a');
    if (!link?.href) return;
    event.preventDefault();
    window.open(link.href, '_blank', 'noopener,noreferrer');
  };

  const handleEditorBlur = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextHtml = linkifyNoteHtml(getSerializedEditorHtml());
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
        </div>
        <div className="notes-editor-toolbar flex flex-wrap gap-2 border-b px-4 py-3">
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
          <div className="notes-editor-list-menu relative">
            <button
              type="button"
              className="notes-editor-tool inline-flex items-center justify-center rounded-full p-2 disabled:cursor-not-allowed disabled:opacity-45"
              title={hasSelection ? 'Список' : 'Список — сначала выделите текст'}
              aria-label="Список"
              aria-expanded={isListMenuOpen}
              disabled={!hasSelection}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setIsListMenuOpen((prev) => !prev)}
            >
              <ListChecks size={15} />
            </button>
            {isListMenuOpen ? (
              <div className="notes-editor-list-dropdown absolute left-0 top-[calc(100%+0.35rem)] z-10 min-w-44 rounded-xl border p-1.5 shadow-2xl">
                {NOTE_LIST_BUTTONS.map((button) => {
                  const Icon = button.icon;
                  return (
                    <button
                      key={button.format}
                      type="button"
                      className="notes-editor-list-option flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyListFormat(button.format)}
                    >
                      <Icon size={14} /> {button.title}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="notes-editor-tool inline-flex items-center justify-center rounded-full p-2 disabled:cursor-not-allowed disabled:opacity-45"
            title={hasSelection ? 'Чекбоксы' : 'Чекбоксы — сначала выделите текст'}
            aria-label="Чекбоксы"
            disabled={!hasSelection}
            onMouseDown={(event) => event.preventDefault()}
            onClick={applyChecklistFormat}
          >
            <CheckSquare size={15} />
          </button>
        </div>
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
