import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('website descriptions remain editable HTML without a preview-to-textarea swap', async () => {
  const [entry, rich, focus, editor, mini] = await Promise.all([
    read('../../client/src/components/TaskDescriptionInput.tsx'),
    read('../../client/src/components/InlineRichDescriptionEditor.tsx'),
    read('../../client/src/App.tsx'),
    read('../../client/src/components/TaskEditor.tsx'),
    read('../../client/src/MiniApp.tsx')
  ]);

  assert.match(entry, /richInlineEditing\?: boolean/);
  assert.match(entry, /if \(richInlineEditing\) \{/);
  assert.match(entry, /return <InlineRichDescriptionEditor/);
  assert.match(focus, /<TaskDescriptionInput\s+key=\{focusedTask\.id\}\s+richInlineEditing/);
  assert.match(editor, /<TaskDescriptionInput\s+key=\{task\?\.id \?\? 'new-task'\}\s+richInlineEditing\s+readOnly=\{externalReadOnly\}/);
  assert.doesNotMatch(mini, /richInlineEditing/);

  // Native contentEditable keeps the DOM selection at the user's actual click.
  assert.match(rich, /contentEditable=\{!readOnly\}/);
  assert.match(rich, /onInput=\{emitChange\}/);
  assert.match(rich, /onPaste=\{pastePlainText\}/);
  assert.match(rich, /onBlur=\{handleBlur\}/);
  assert.match(rich, /onClick=\{handleClick\}/);
  assert.match(rich, /editor === document\.activeElement \|\| editor\.contains\(document\.activeElement\)/);
  assert.match(rich, /if \(editor\.innerHTML !== normalized\) editor\.innerHTML = normalized/);
  assert.match(rich, /noteValueToEditorHtml\(value \?\? ''\)/);
  assert.match(rich, /linkifyNoteHtml\(editor\.innerHTML\)/);
  assert.match(rich, /event\.clipboardData\.getData\('text\/plain'\)/);
  assert.match(rich, /selection\.addRange\(range\)/);
  assert.doesNotMatch(rich, /<textarea|setIsEditing|noteHtmlToPlainText|setSelectionRange\(0/);

  // Full notes editor remains the only place for toolbar-based formatting.
  assert.match(editor, /<TaskNotesEditor\s+value=\{descriptionValue\}/);
  assert.match(focus, /setIsFocusedNotesEditorOpen\(true\)/);
});

test('subtask editor has the same labelled notes action and preserves old height/hover styles', async () => {
  const [task, css, size] = await Promise.all([
    read('../../client/src/components/TaskEditor.tsx'),
    read('../../client/src/styles.css'),
    read('../../client/src/components/ResizableDescriptionSurface.tsx')
  ]);
  assert.match(task, /className="focused-task-label-button inline-flex min-h-8/);
  assert.match(task, /<Edit3 size=\{15\} aria-hidden="true" \/>\s*<span>Редактировать описание<\/span>/);
  assert.match(task, /onClick=\{\(\) => setIsNotesEditorOpen\(true\)\}/);
  assert.match(task, /disabled=\{externalReadOnly\}/);
  assert.match(css, /\.task-description-inline-rich h1/);
  assert.match(css, /\.task-description-inline-rich h2/);
  assert.match(css, /\.task-description-inline-rich:empty::before/);
  assert.match(css, /\.resizable-description-surface > \.task-description-preview,/);
  assert.match(css, /\.focused-task-editor-shell \.focused-task-description-surface:hover/);
  assert.match(css, /body\[data-theme='dark'\] \.focused-task-editor-shell \.focused-task-description-surface:hover/);
  assert.match(size, /setPointerCapture/);
  assert.match(size, /localStorage\.setItem\(storageKey/);
});
