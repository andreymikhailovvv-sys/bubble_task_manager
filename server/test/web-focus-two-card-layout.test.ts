import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('personal web focus task splits task and subtasks into two cards aligned with AI panel', async () => {
  const [app, styles, frame, mini] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/FocusedTaskWindowFrame.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8')
  ]);
  const begin = app.indexOf('<aside className="focused-task-editor-shell focus-mode-shell focused-task-modal-panel-height focused-task-split-shell');
  const end = app.indexOf('</aside>', begin);
  assert.ok(begin > 0 && end > begin, 'desktop focus layout exists');
  const focus = app.slice(begin, end);
  const main = focus.indexOf('focused-task-primary-card');
  const subtasks = focus.indexOf('focused-task-subtasks-card');
  assert.ok(main > 0 && subtasks > main, 'primary task card precedes separate subtasks card');
  assert.match(focus, /focused-task-split-layout flex h-full min-h-0 flex-col gap-3/);
  assert.match(styles, /\.focused-task-modal-panel-height \{[\s\S]*?height: min\(90dvh, 800px\)/);
  assert.match(styles, /\.focused-task-split-layout \{ height: 100%; min-height: 0; gap: 12px;/);
  assert.match(styles, /\.focused-task-split-shell \.focused-task-primary-card \{[\s\S]*?flex: 0 0 55%/);
  assert.match(app, /className="ai-chat-lightweight app-side-panel focused-task-ai-panel focused-task-modal-panel-height/);
  assert.match(frame, /focused-task-modal-layout flex/);

  for (const anchor of [
    'focused-task-deadline-chip', 'focused-task-subtask-deadline-chip', 'focused-task-subtask-overdue',
    'focused-task-attachment-row', 'focusedTaskAttachmentInputRef.current?.click()',
    'ref={focusedTaskAttachmentInputRef}', 'focusedTaskAttachments.map', 'uploadFocusedTaskFiles',
    'downloadTaskAttachment', 'removeTaskAttachment',
    'setIsFocusedNotesEditorOpen(true)', 'focused-task-edit-description-button',
    'completeTask(focusedTask)', 'api.deleteTask(focusedTask.id',
    'setIsFocusedCalendarExportOpen(true)', 'setIsFocusedSettingsOpen', 'api.createTaskShare',
    'setIsAddingFocusedSubtask(true)', 'FocusedSubtaskComposer',
    'onReorder={(nextOrder)', 'toggleSubtaskDone(subtask)', 'setEditorState({ task: subtask })',
    'onContextMenu={(event) => handleSubtaskCommentContextMenu', 'setIsSubtaskFilterOpen',
    'renderSubtaskCommentButton', 'api.updateTask(subtask.id, { dueDate })'
  ]) assert.ok(focus.includes(anchor), 'original focus action preserved: ' + anchor);

  assert.doesNotMatch(focus, /focused-subtask-row-importance/);
  assert.doesNotMatch(focus, /--subtask-importance-accent/);
  assert.doesNotMatch(focus, /subtask-compact-reminder-static/);
  assert.match(styles, /\.focused-task-split-shell \.focused-task-subtask-card::before \{ display: none !important; \}/);
  assert.match(styles, /\.focused-task-split-shell \.focused-task-subtask-card\.focused-task-subtask-overdue/);
  assert.match(styles, /body\[data-theme='dark'\] \.focused-task-editor-shell\.focused-task-split-shell \.focused-task-primary-card/);
  assert.match(styles, /@media \(max-width: 639px\)/);
  assert.doesNotMatch(mini, /focused-task-split-shell/);
});
