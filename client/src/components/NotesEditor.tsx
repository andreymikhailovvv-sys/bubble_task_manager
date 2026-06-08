import { Bold, CheckSquare, Heading1, Heading2, Italic, ListChecks, ListOrdered, List as ListIcon, Underline, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { linkifyNoteHtml, noteValueToEditorHtml } from '../lib/notes';

type NoteFormat = 'plain' | 'h1' | 'h2' | 'bold' | 'underline' | 'italic';
type NoteListFormat = 'ordered' | 'unordered';

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

const STRUCTURED_NOTE_SELECTOR = '.note-list, .note-checklist';
const NOTE_LINE_BREAK_TAGS = new Set(['BR', 'DIV', 'P', 'H1', 'H2', 'LI']);

function selectionBelongsToEditor(editor: HTMLDivElement, selection: Selection) {
  if (!selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer);
}

function getSelectedLines(range: Range) {
  const lines: string[] = [];
  let currentLine = '';

  const pushLine = () => {
    const normalizedLine = currentLine.replace(/\u00a0/g, ' ').trim();
    if (normalizedLine) {
      lines.push(normalizedLine);
    }
    currentLine = '';
  };

  const appendText = (value: string) => {
    value.replace(/\u00a0/g, ' ').split(/\r?\n/).forEach((part, index) => {
      if (index > 0) pushLine();
      currentLine += part;
    });
  };

  const walkNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent ?? '');
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as Element;
    if (element.tagName === 'BR') {
      pushLine();
      return;
    }

    if (element.tagName === 'INPUT') return;

    Array.from(element.childNodes).forEach(walkNode);
    if (NOTE_LINE_BREAK_TAGS.has(element.tagName)) {
      pushLine();
    }
  };

  Array.from(range.cloneContents().childNodes).forEach(walkNode);
  pushLine();

  if (lines.length > 0) return lines;

  const fallbackText = range.toString().replace(/\u00a0/g, ' ').trim();
  return fallbackText ? fallbackText.split(/\n+/).map((line) => line.trim()).filter(Boolean) : [''];
}

function getRangeElement(range: Range) {
  return range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer as Element
    : range.commonAncestorContainer.parentElement;
}

function createTextBlockFromHtml(html: string) {
  const block = document.createElement('div');
  block.innerHTML = html.trim() || '<br>';
  return block;
}

function createListItem(line: string) {
  const item = document.createElement('li');
  if (line) {
    item.textContent = line;
  } else {
    item.append(document.createElement('br'));
  }
  return item;
}

function createChecklistItem(line: string) {
  const item = document.createElement('div');
  item.className = 'note-checkbox-item';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  const text = document.createElement('span');
  if (line) {
    text.textContent = line;
  } else {
    text.append(document.createElement('br'));
  }
  item.append(checkbox, text);
  return item;
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
      const nextSelectionBelongsToEditor = Boolean(editor && selection && selectionBelongsToEditor(editor, selection));
      const nextHasSelection = Boolean(nextSelectionBelongsToEditor && selection && !selection.isCollapsed);
      setHasSelection(nextHasSelection);

      if (!nextSelectionBelongsToEditor || !selection?.rangeCount) {
        setSelectionMenuPosition(null);
        return;
      }

      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
      if (!nextHasSelection) {
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

  const createFallbackRange = (editor: HTMLDivElement) => {
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    savedRangeRef.current = range.cloneRange();
    return range;
  };

  const restoreSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const range = savedRangeRef.current;
    if (!editor || !selection) return null;

    const nextRange = range && editor.contains(range.commonAncestorContainer) ? range : createFallbackRange(editor);
    editor.focus();
    selection.removeAllRanges();
    selection.addRange(nextRange);
    return nextRange;
  };

  const setCaretInside = (element: HTMLElement) => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection) return;

    editor.focus();
    const caretRange = document.createRange();
    caretRange.selectNodeContents(element);
    caretRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(caretRange);
    savedRangeRef.current = caretRange.cloneRange();
  };

  const finishFormatting = (keepSelection = false) => {
    syncValue();
    setHasSelection(keepSelection);
    setSelectionMenuPosition(null);
    setIsListMenuOpen(false);
  };

  const unwrapStructuredBlock = (range: Range) => {
    const rangeElement = getRangeElement(range);
    const structuredBlock = rangeElement?.closest(STRUCTURED_NOTE_SELECTOR);
    if (!structuredBlock) return false;

    const replacement = document.createDocumentFragment();
    if (structuredBlock.classList.contains('note-checklist')) {
      structuredBlock.querySelectorAll<HTMLElement>('.note-checkbox-item').forEach((item) => {
        const textElement = item.querySelector('span');
        replacement.append(createTextBlockFromHtml(textElement?.innerHTML ?? item.textContent ?? ''));
      });
    } else {
      structuredBlock.querySelectorAll('li').forEach((item) => {
        replacement.append(createTextBlockFromHtml(item.innerHTML));
      });
    }

    const firstReplacement = replacement.firstChild as HTMLElement | null;
    structuredBlock.replaceWith(replacement);
    if (firstReplacement) {
      setCaretInside(firstReplacement);
    }
    return true;
  };

  const applyFormat = (button: FormatButton) => {
    const editor = editorRef.current;
    const range = restoreSelection();
    if (!editor || !range) return;

    if (button.format === 'plain') {
      if (unwrapStructuredBlock(range)) {
        finishFormatting();
        return;
      }
      document.execCommand('removeFormat');
      document.execCommand('formatBlock', false, '<div>');
      finishFormatting();
      return;
    }

    if (!hasSelection || !button.tagName) return;
    const wrapper = document.createElement(button.tagName);
    wrapper.append(range.extractContents());
    range.insertNode(wrapper);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(wrapper);
    selection?.addRange(nextRange);
    savedRangeRef.current = nextRange.cloneRange();
    finishFormatting(true);
  };

  const applyListFormat = (format: NoteListFormat) => {
    const range = restoreSelection();
    if (!range) return;

    const selectedLines = getSelectedLines(range);
    const wrapper = document.createElement(format === 'ordered' ? 'ol' : 'ul');
    wrapper.className = format === 'ordered' ? 'note-list note-list-ordered' : 'note-list note-list-unordered';
    selectedLines.forEach((line) => wrapper.append(createListItem(line)));

    range.deleteContents();
    range.insertNode(wrapper);
    setCaretInside(wrapper.querySelector('li') ?? wrapper);
    finishFormatting();
  };

  const applyChecklistFormat = () => {
    const range = restoreSelection();
    if (!range) return;

    const selectedLines = getSelectedLines(range);
    const list = document.createElement('div');
    list.className = 'note-checklist';
    selectedLines.forEach((line) => list.append(createChecklistItem(line)));

    range.deleteContents();
    range.insertNode(list);
    setCaretInside(list.querySelector<HTMLElement>('.note-checkbox-item span') ?? list);
    finishFormatting();
  };

  const handleEditorClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const checkbox = target instanceof HTMLInputElement && target.matches('.note-checklist input[type="checkbox"]') ? target : null;
    if (checkbox) {
      const item = checkbox.closest('.note-checkbox-item');
      item?.classList.toggle('note-checkbox-item-checked', checkbox.checked);
      window.setTimeout(syncValue, 0);
      return;
    }

    const link = target.closest('a');
    if (!link?.href) return;
    event.preventDefault();
    window.open(link.href, '_blank', 'noopener,noreferrer');
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!editor || !selection?.rangeCount || !selection.isCollapsed || !selectionBelongsToEditor(editor, selection)) return;

    const range = selection.getRangeAt(0);
    const rangeElement = getRangeElement(range);

    if (event.key === 'Enter' && !event.shiftKey) {
      const currentChecklistItem = rangeElement?.closest<HTMLElement>('.note-checklist .note-checkbox-item');
      if (!currentChecklistItem) return;

      event.preventDefault();
      const nextChecklistItem = createChecklistItem('');
      currentChecklistItem.after(nextChecklistItem);
      setCaretInside(nextChecklistItem.querySelector<HTMLElement>('span') ?? nextChecklistItem);
      finishFormatting();
      return;
    }

    if (event.key !== 'Backspace') return;

    const structuredBlock = rangeElement?.closest(STRUCTURED_NOTE_SELECTOR);
    if (!structuredBlock || structuredBlock.textContent?.trim()) return;

    event.preventDefault();
    if (unwrapStructuredBlock(range)) {
      finishFormatting();
    }
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
            <p className="text-xs text-muted">Выделите текст для форматирования или добавьте список/чекбоксы в текущую позицию курсора.</p>
          </div>
        </div>
        <div className="notes-editor-toolbar flex flex-wrap gap-2 border-b px-4 py-3">
          {NOTE_FORMAT_BUTTONS.map((button) => {
            const Icon = button.icon;
            const isPlainButton = button.format === 'plain';
            const isDisabled = !isPlainButton && !hasSelection;
            return (
              <button
                key={button.format}
                type="button"
                className="notes-editor-tool inline-flex items-center justify-center rounded-full p-2 disabled:cursor-not-allowed disabled:opacity-45"
                title={isDisabled ? `${button.title} — сначала выделите текст` : button.title}
                aria-label={button.title}
                disabled={isDisabled}
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
              className="notes-editor-tool inline-flex items-center justify-center rounded-full p-2"
              title="Список"
              aria-label="Список"
              aria-expanded={isListMenuOpen}
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
            className="notes-editor-tool inline-flex items-center justify-center rounded-full p-2"
            title="Чекбоксы"
            aria-label="Чекбоксы"
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
          onKeyDown={handleEditorKeyDown}
        />
      </section>
    </div>
  );
}
