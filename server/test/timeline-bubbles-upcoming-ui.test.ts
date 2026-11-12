import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('месячный таймлайн строит соседние дни как реальные интерактивные даты', async () => {
  const source = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('function buildTimelineViewData');
  const end = source.indexOf('export default function App', start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);

  assert.match(block, /const monthGridStart = normalizeToMonday\(monthStart\)/);
  assert.match(block, /const monthGridEnd = addDays\(normalizeToMonday\(monthLastDay\), 7\)/);
  assert.match(block, /for \(let date = new Date\(monthGridStart\); date < monthGridEnd; date = addDays\(date, 1\)\)/);
  assert.doesNotMatch(block, /key: `empty-/);
  assert.doesNotMatch(block, /date: null/);
});

test('предпросмотр месяца тоже заполняет соседние дни реальными датами', async () => {
  const source = await readFile(new URL('../../client/src/components/DateTimePickerWithApply.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('const monthCells = useMemo');
  const end = source.indexOf('const timelineTasksByDate', start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);

  assert.match(block, /const dates: Date\[\] = \[\]/);
  assert.match(block, /dates\.push\(new Date\(date\)\)/);
  assert.doesNotMatch(block, /return null/);
});

test('поиск по пузырям использует короткую анимацию фильтрации', async () => {
  const [app, bubble] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/BubbleField.tsx', import.meta.url), 'utf8')
  ]);

  assert.match(app, /isSearchFiltering=\{Boolean\(search\.trim\(\)\)\}/);
  assert.match(bubble, /isSearchFiltering\?: boolean/);
  assert.match(bubble, /isSearchFiltering[\s\S]*type: 'tween', duration: 0\.12/);
  assert.match(bubble, /exit=\{isSearchFiltering \? \{ opacity: 0/);
});

test('окно ближайших подзадач имеет фиксированные карточки, бирюзовое закрытие и анимацию выполнения', async () => {
  const [app, styles] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);

  assert.match(app, /upcoming-subtasks-close-button/);
  assert.match(app, /upcoming-subtask-row[\s\S]*h-\[7rem\][\s\S]*min-h-\[7rem\]/);
  assert.match(app, /closingTaskIds\.includes\(subtask\.id\)[\s\S]*focused-subtask-row-completing/);
  assert.match(app, /timeline-task-chip-completed line-through/);
  assert.match(app, /line-clamp-2/);
  assert.match(styles, /\.upcoming-subtasks-close-button \{/);
  assert.match(styles, /color: #0891b2 !important/);
  assert.match(styles, /\.upcoming-subtask-row \{[\s\S]*height: 7rem;[\s\S]*min-height: 7rem;/);
});


test('completed bubble never fades back in and confetti stays at its disappearance point', async () => {
  const [app, bubble] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/BubbleField.tsx', import.meta.url), 'utf8')
  ]);
  const completeStart = app.indexOf('const completeTask = async');
  const completeEnd = app.indexOf('const saveFocusedTask = async', completeStart);
  const completion = app.slice(completeStart, completeEnd);
  assert.ok(completeStart >= 0 && completeEnd > completeStart);
  assert.ok(completion.indexOf('await load()') < completion.indexOf('unmarkTaskAsClosing(task.id)'));
  assert.match(completion, /setTasks\(\(current\) => current\.map/);
  assert.match(completion, /finally \{/);
  assert.match(bubble, /exit=\{isSearchFiltering \? \{ opacity: 0[^\n]+: \{ opacity: 0, scale: isPopping/);
  assert.match(bubble, /BUBBLE_COMPLETION_CONFETTI/);
  assert.match(bubble, /capturedCompletionIdRef\.current === poppingTaskId/);
  assert.match(bubble, /completionBursts\.map\(\(burst\) =>/);
  assert.match(bubble, /reducedMotion\) return/);
});
