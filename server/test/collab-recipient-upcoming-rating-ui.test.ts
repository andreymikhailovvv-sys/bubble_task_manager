import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('выбор получателя показывается только при работе с composer и сохраняется отдельно для пользователя', async () => {
  const [web, mini, storage] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/taskAiRecipientStorage.ts', import.meta.url), 'utf8')
  ]);

  assert.match(storage, /TASK_AI_RECIPIENT_STORAGE_PREFIX = 'btm:task-ai-recipient:v1'/);
  assert.match(storage, /getStorageKey = \(userId: string\) =>/);
  assert.match(storage, /localStorage\.getItem\(getStorageKey\(userId\)\)/);
  assert.match(storage, /localStorage\.setItem\(getStorageKey\(userId\), JSON\.stringify\(selection\)\)/);

  for (const source of [web, mini]) {
    assert.match(source, /loadTaskAiRecipientSelection\(userId\)/);
    assert.match(source, /saveTaskAiRecipientSelection\(userId, aiRecipientByTaskId\)/);
    assert.match(source, /selectedRecipientId === 'ai'/);
    assert.match(source, /collaborationMembers\?\.some/);
    assert.match(source, /onFocusCapture=\{\(\) => setIs.*RecipientPickerVisible\(true\)\}/);
    assert.match(source, /onBlurCapture=\{\(event\) =>/);
  }

  assert.match(web, /isAiRecipientPickerVisible \? renderTaskAiRecipientPicker\(focusedTask\) : null/);
  assert.match(mini, /isTaskAiRecipientPickerVisible && openedTask\.isCollaborative/);
});

test('главная показывает три ближайшие подзадачи, а в окне доступны все', async () => {
  const web = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  assert.match(web, /const upcomingSubtasksForPanel = useMemo\([\s\S]*?\.sort\(\(a, b\) => a\.dueTimestamp - b\.dueTimestamp\)\s*\.slice\(0, 3\)/);
  assert.match(web, /useState<'all' \| 'today' \| 'tomorrow' \| 'week' \| 'no_due'>\('all'\)/);
  assert.match(web, /if \(upcomingSubtasksFilter === 'all'\) return true;/);
  assert.equal((web.match(/\{ key: 'all', label: 'все' \}/g) ?? []).length, 2);
});

test('развёрнутые карточки подзадач увеличивают высоту под длинный текст', async () => {
  const [web, styles] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);
  assert.equal((web.match(/className="upcoming-subtask-copy min-w-0 flex-1"/g) ?? []).length, 2);
  assert.match(styles, /\.upcoming-subtask-row \{\s*height: auto;\s*min-height: 7rem;/);
  assert.match(styles, /\.upcoming-subtask-copy \{[\s\S]*?height: auto;\s*max-height: none;/);
  assert.match(styles, /\.upcoming-subtask-description \{[\s\S]*?max-height: none;[\s\S]*?white-space: pre-wrap;/);
  assert.doesNotMatch(web, /upcoming-subtask-row[^\n]*h-\[7rem\]/);
});

test('скругления полей и заметки не перекрываются содержимым', async () => {
  const [styles, notes] = await Promise.all([
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/StandaloneNotesWorkspace.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(styles, /\.bubble-field-stage \{\s*background: transparent;/);
  assert.match(styles, /\.bubble-field-container \{[\s\S]*?background: var\(--bubble-field-bg\), var\(--canvas-bg\);/);
  assert.match(styles, /\.workspace-widget-card \{\s*overflow: hidden;/);
  assert.match(styles, /\.workspace-global-search-field \{\s*overflow: hidden;/);
  assert.match(styles, /\.standalone-note-open \{[\s\S]*?justify-content: flex-start;/);
  assert.match(notes, /standalone-note-open min-w-0 flex-1/);
});

test('рейтинг Mini App использует тот же яркий визуальный набор, что и web', async () => {
  const [web, mini] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8')
  ]);

  for (const className of [
    'efficiency-details-popover-modern',
    'efficiency-score-hero',
    'efficiency-detail-row',
    'efficiency-detail-row-focus'
  ]) {
    assert.ok(web.includes(className), `web должен использовать ${className}`);
    assert.ok(mini.includes(className), `Mini App должен использовать ${className}`);
  }
});
