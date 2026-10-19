import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
const stylesheet = await readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8');

test('desktop focus and focus mode subtasks share the comments-style attachment indicator', () => {
  assert.equal(appSource.split('{renderWorkspaceAttachmentIndicator(subtask)}').length - 1, 2);
  assert.doesNotMatch(appSource, /<Paperclip size=\{13\} className="text-violet-500"/);
  const commentButton = appSource.slice(appSource.indexOf('const renderSubtaskCommentButton'), appSource.indexOf('useEffect(() => {\n    if (!subtaskCommentPanel'));
  assert.match(commentButton, /task-card-meta-indicator task-card-meta-action/);
  assert.match(commentButton, /<MessageCircle size=\{15\} \/>/);
  assert.match(commentButton, /void openSubtaskComments\(subtask\)/);
});

test('list task icons appear to the left of importance/coefficient in the same style', () => {
  const start = appSource.indexOf('const taskCoefficient = getTaskCoefficient(task, displayedSubtaskMap)');
  assert.ok(start >= 0);
  const list = appSource.slice(start, start + 7000);
  const comments = list.indexOf('renderWorkspaceCommentIndicator(task)');
  const attachments = list.indexOf('renderWorkspaceAttachmentIndicator(task)');
  const coefficient = list.indexOf("rankingMode === 'coefficient'");
  assert.ok(comments >= 0 && attachments > comments && coefficient > attachments);
  assert.match(list, /list-task-coefficient-badge/);
  assert.match(list, /list-task-importance-badge/);
});

test('comment icon is a plain 15px outline in list, but compact timeline indicator is preserved', () => {
  const start = appSource.indexOf('const renderWorkspaceCommentIndicator');
  const end = appSource.indexOf('const renderSubtaskCommentButton', start);
  const component = appSource.slice(start, end);
  assert.match(component, /'task-card-meta-indicator relative'/);
  assert.match(component, /<MessageCircle size=\{compact \? 11 : 15\} \/>/);
  assert.match(component, /unreadCommentCount/);
  assert.match(component, /rounded-full bg-violet-600/);
  assert.match(appSource, /renderWorkspaceCommentIndicator\(task, true\)/);
});

test('attachments only show when server-provided count is positive, no extra fetches', () => {
  const component = appSource.slice(appSource.indexOf('const renderWorkspaceAttachmentIndicator'), appSource.indexOf('const renderSubtaskCommentButton'));
  assert.match(component, /const total = task\.attachmentCount \?\? 0/);
  assert.match(component, /if \(total <= 0\) return null/);
  assert.match(component, /className="task-card-meta-indicator"/);
  assert.match(component, /<Paperclip size=\{15\} \/>/);
  assert.doesNotMatch(component, /api\./);
});

test('indicator styling stays theme aware and does not alter Mini App', async () => {
  assert.match(stylesheet, /\.task-card-meta-indicator \{/);
  assert.match(stylesheet, /color: var\(--text-muted\)/);
  assert.match(stylesheet, /\.task-card-meta-action:hover \{/);
  assert.match(stylesheet, /background: color-mix\(in srgb, var\(--accent\)/);
  assert.match(stylesheet, /body\[data-theme='dark'\][\s\S]*?--text-muted:/);
  assert.match(stylesheet, /body\[data-theme='light'\][\s\S]*?--text-muted:/);
  const miniAppSource = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(miniAppSource, /task-card-meta-indicator/);
});
