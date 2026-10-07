import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('смена сектора обновляет только локальную задачу без глобального refresh', async () => {
  const [app, editor] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/TaskEditor.tsx', import.meta.url), 'utf8')
  ]);

  assert.match(editor, /onSphereChange\?: \(sphereId: string \| null\) => void/);
  assert.match(editor, /if \(isEditing\) onSphereChange\?\.\(nextSphereId\)/);

  const taskEditorUsageStart = app.indexOf('<TaskEditor');
  const taskEditorUsageEnd = app.indexOf('/>', taskEditorUsageStart);
  assert.ok(taskEditorUsageStart >= 0 && taskEditorUsageEnd > taskEditorUsageStart);
  const taskEditorUsage = app.slice(taskEditorUsageStart, taskEditorUsageEnd);

  assert.match(taskEditorUsage, /onSphereChange=\{editorState\.task\?\.id \? \(sphereId\) =>/);
  assert.match(taskEditorUsage, /task\.id === taskId \? \{ \.\.\.task, sphereId \} : task/);
  assert.doesNotMatch(taskEditorUsage, /load\(/);
  assert.doesNotMatch(taskEditorUsage, /getTasks\(/);

  const focusStart = app.indexOf('focused-task-sector-button');
  const focusEnd = app.indexOf('focused-task-notify', focusStart);
  assert.ok(focusStart >= 0 && focusEnd > focusStart);
  const focusBlock = app.slice(focusStart, focusEnd);

  assert.match(focusBlock, /const nextSphereId = sphere\.id \|\| null/);
  assert.match(focusBlock, /task\.id === focusedTask\.id \? \{ \.\.\.task, sphereId: nextSphereId \} : task/);
  assert.doesNotMatch(focusBlock, /load\(/);
  assert.doesNotMatch(focusBlock, /getTasks\(/);
  assert.doesNotMatch(focusBlock, /setInterval/);
});
