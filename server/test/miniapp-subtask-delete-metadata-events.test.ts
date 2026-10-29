import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const mini = () => readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
const css = () => readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8');

test('deleting a subtask closes only its editor after server success and removes the row', async () => {
  const source = await mini();
  const start = source.indexOf('  const deleteTask = async (taskId: string,');
  const end = source.indexOf('\n  const openCreateSubtaskModal =', start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);
  const serverDelete = handler.indexOf('await api.deleteTask(taskId,');
  const remove = handler.indexOf('setTasks((current) => current.filter(', serverDelete);
  const closeSubtask = handler.indexOf('if (openedSubtaskId === taskId)', remove);
  const closeParent = handler.indexOf('if (openedTaskId === taskId)', closeSubtask);
  const reload = handler.indexOf('await loadData({ refreshPlannerOnly: true })', closeParent);
  assert.ok(serverDelete >= 0 && remove > serverDelete && closeSubtask > remove && closeParent > closeSubtask && reload > closeParent);
  assert.match(handler, /setOpenedSubtaskId\(null\)/);
  assert.match(handler, /setIsSubtaskNotesEditorOpen\(false\)/);
  assert.match(handler, /delete taskDraftOriginalByIdRef\.current\[taskId\]/);
  assert.match(handler, /setDeletingId\(null\)/);
  assert.match(handler, /!task\.parentTaskId && !scope/);
  assert.doesNotMatch(handler, /setOpenedTaskId\(null\)/);
  assert.match(source, /onClick=\{\(\) => void deleteTask\(openedSubtask\.id\)\}/);
});

test('Mini App focus subtask indicators share size, outline and neutral theme colors with website', async () => {
  const [source, stylesheet] = await Promise.all([mini(), css()]);
  const start = source.indexOf('openedTaskSubtasks.map((subtask)');
  const end = source.indexOf('              </div>\n            </div>', start);
  const row = source.slice(start, end);
  assert.match(row, /subtask\.attachmentCount \?\? 0/);
  assert.match(row, /className="task-card-meta-indicator"/);
  assert.match(row, /<Paperclip size=\{15\} \/>/);
  assert.match(row, /className="task-card-meta-indicator task-card-meta-action relative"/);
  assert.match(row, /<MessageCircle size=\{15\} \/>/);
  assert.match(row, /openTaskComments\(subtask\)/);
  assert.match(row, /unreadCommentCount/);
  assert.match(stylesheet, /\.miniapp-shell \.miniapp-focus-subtask-row \.task-card-meta-indicator \{/);
  assert.match(stylesheet, /height: 1\.75rem/);
  assert.match(stylesheet, /stroke-width: 1\.85/);
  assert.match(stylesheet, /\.miniapp-shell\.miniapp-light \.miniapp-focus-subtask-row \.task-card-meta-indicator/);
});

test('mobile timeline events have readable text in dark and light Mini App themes', async () => {
  const [source, stylesheet] = await Promise.all([mini(), css()]);
  assert.match(source, /isEvent \? 'miniapp-timeline-event-card'/);
  assert.match(stylesheet, /\.miniapp-shell:not\(\.miniapp-light\) \.miniapp-timeline-event-card \{/);
  assert.match(stylesheet, /\.miniapp-shell:not\(\.miniapp-light\) \.miniapp-timeline-event-card \.miniapp-timeline-card-title/);
  assert.match(stylesheet, /\.miniapp-shell:not\(\.miniapp-light\) \.miniapp-timeline-event-card > p:not\(\.miniapp-timeline-card-title\)/);
  assert.match(stylesheet, /\.miniapp-shell\.miniapp-light \.miniapp-timeline-event-card/);
});
