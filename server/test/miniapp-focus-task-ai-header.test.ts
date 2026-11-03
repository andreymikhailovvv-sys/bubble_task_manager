import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('focus sheet has explicit date and expand labels and one dominant completion action', async () => {
  const [mini, picker, css] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/DateTimePickerWithApply.tsx'),
    read('../../client/src/styles.css')
  ]);
  const begin = mini.indexOf('miniapp-focus-task-scroll-layout');
  const end = mini.indexOf('{isCollaborationSettingsOpen && openedTask?.isCollaborative', begin);
  assert.ok(begin > 0 && end > begin);
  const focus = mini.slice(begin, end);
  assert.match(focus, /iconOnly buttonLabel="Выбрать дату"/);
  assert.match(picker, /buttonLabel\?: string/);
  assert.match(picker, /\{iconOnly && buttonLabel \? <span/);
  assert.match(focus, /miniapp-focus-expand-description/);
  assert.match(focus, /Редактировать описание/);
  assert.doesNotMatch(focus, /На весь экран/);
  assert.match(focus, /<ResizableDescriptionSurface className="miniapp-focus-description-surface/);
  assert.match(focus, /Описание<\/h3>/);
  assert.match(focus, /openedTaskDraft\.dueDate \? formatRemaining\(openedTaskDraft\.dueDate\)/);
  assert.doesNotMatch(focus, /До дедлайна:/);
  assert.match(focus, /miniapp-focus-primary-actions/);
  assert.match(focus, /completeTask\(openedTask\.id\)/);
  assert.match(focus, /deleteTask\(openedTask\.id\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1\.9fr\) minmax\(0, \.9fr\)/);
  assert.match(focus, /<Paperclip size=\{15\}/);
  assert.match(focus, /miniapp-focus-subtask-add-button/);
});

test('completed subtasks toggle at bottom with count and preserve checked state handling', async () => {
  const mini = await read('../../client/src/MiniApp.tsx');
  const from = mini.indexOf('miniapp-focus-section-subtasks miniapp-focus-subtasks');
  const until = mini.indexOf('{isCollaborationSettingsOpen && openedTask?.isCollaborative', from);
  const section = mini.slice(from, until);
  const doneToggle = section.indexOf('miniapp-focus-show-completed');
  const subtaskRows = section.indexOf('openedTaskSubtasks.map((subtask)');
  assert.ok(subtaskRows >= 0 && doneToggle > subtaskRows);
  assert.match(section, /openedTaskCompletedSubtaskCount > 0/);
  assert.match(section, /Показать выполненные/);
  assert.match(section, /Скрыть выполненные/);
  assert.match(section, /\(\{openedTaskCompletedSubtaskCount\}\)/);
  assert.match(section, /aria-pressed=\{!hideClosedOpenedTaskSubtasks\}/);
  assert.match(section, /setHideClosedOpenedTaskSubtasks\(current => !current\)/);
  assert.doesNotMatch(section.slice(0, subtaskRows), /miniapp-focus-subtask-visibility-button/);
  assert.match(mini, /filter\(task => task\.status === 'DONE'\)\.length/);
});

test('task AI uses general-style custom picker and monitoring mode without changing chat content', async () => {
  const [mini, taskHeader, generalHeader, css] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/MiniTaskAiChatHeader.tsx'),
    read('../../client/src/components/MiniGeneralAiChatHeader.tsx'),
    read('../../client/src/styles.css')
  ]);
  const ai = mini.slice(mini.indexOf('miniapp-ai-chat-backdrop-task'), mini.indexOf('miniapp-ai-chat-backdrop-general'));
  assert.match(ai, /<MiniTaskAiChatHeader/);
  assert.match(ai, /taskTitle=\{openedTask\.title\}/);
  assert.match(ai, /monitoringControl=\{taskMonitoringControl\}/);
  assert.match(ai, /onSelectModel=\{\(model\) =>/);
  assert.doesNotMatch(ai.slice(0, ai.indexOf('miniapp-ai-chat-thread-wrap')), /<select/);
  assert.match(taskHeader, /miniapp-ai-context-main-row/);
  assert.match(generalHeader, /miniapp-ai-context-main-row/);
  assert.match(taskHeader, /miniapp-ai-context-controls miniapp-task-ai-context-controls/);
  assert.match(taskHeader, /Модель ИИ/);
  assert.match(taskHeader, /Режим/);
  assert.match(taskHeader, /monitoringEnabled/);
  assert.match(taskHeader, /modelOptions\.map/);
  assert.match(taskHeader, /role="dialog" aria-modal="true"/);
  assert.match(taskHeader, /role="radio" aria-checked=\{model === option\.value\}/);
  assert.match(taskHeader, /disabled=\{monitoringEnabled\}/);
  assert.match(mini, /updateAiChatHeaderVisibility\(event\.currentTarget\.scrollTop, taskAiChatScrollTopRef, setIsTaskAiChatHeaderHidden\)/);
  assert.match(mini, /<MiniAiChatComposer/);
  assert.match(css, /\.miniapp-ai-chat-panel-task \.miniapp-task-ai-context-header/);
  assert.match(css, /\.miniapp-ai-chat-panel-task \.miniapp-ai-chat-thread-wrap \.miniapp-ai-chat-thread/);
});

test('same Telegram brand appears in focus, task chat and general AI chat', async () => {
  const [mini, css] = await Promise.all([read('../../client/src/MiniApp.tsx'), read('../../client/src/styles.css')]);
  assert.equal((mini.match(/className="miniapp-telegram-service-title miniapp-telegram-overlay-brand"/g) ?? []).length, 3);
  assert.match(css, /miniapp-telegram-fullscreen \.miniapp-telegram-overlay-brand/);
  assert.match(mini, /showTelegramBrand \? <div className="miniapp-telegram-service-title"/);
});


test('focus task is exactly three independent cards: title/date, description/actions, subtasks', async () => {
  const [mini, css] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/styles.css')
  ]);
  const start = mini.indexOf('miniapp-focus-task-panel--sectioned');
  const end = mini.indexOf('{isCollaborationSettingsOpen && openedTask?.isCollaborative', start);
  assert.ok(start > 0 && end > start);
  const focus = mini.slice(start, end);
  const summary = focus.indexOf('miniapp-focus-section-summary');
  const description = focus.indexOf('miniapp-focus-section-content');
  const subtasks = focus.indexOf('miniapp-focus-section-subtasks');
  assert.ok(summary >= 0 && description > summary && subtasks > description);
  assert.equal((focus.match(/<section className="miniapp-focus-section /g) ?? []).length, 3,
    'Summary, description/actions, and subtasks must be separate cards');
  assert.match(focus, /<section className="miniapp-focus-section miniapp-focus-section-subtasks/);
  const top = focus.slice(summary, description);
  const middle = focus.slice(description, subtasks);
  const bottom = focus.slice(subtasks);
  assert.doesNotMatch(top, /Фокус задачи/);
  assert.match(top, /miniapp-focus-summary-header/);
  assert.match(top, /miniapp-focus-title-input/);
  assert.ok(top.indexOf('miniapp-focus-title-input') < top.indexOf('miniapp-focus-summary-actions'),
    'The task name must be in the header before the action icons');
  assert.equal((top.match(/miniapp-focus-title-input/g) ?? []).length, 1);
  assert.match(top, /buttonLabel="Выбрать дату"/);
  assert.match(top, /openedTaskDraft\.dueDate \? formatRemaining\(openedTaskDraft\.dueDate\)/);
  assert.doesNotMatch(top, /miniapp-focus-primary-actions/);
  assert.match(middle, /miniapp-focus-description-surface/);
  assert.match(middle, /miniapp-focus-description-heading/);
  assert.match(middle, /miniapp-focus-expand-description/);
  assert.match(middle, /Paperclip size=\{15\}/);
  assert.match(middle, /miniapp-focus-primary-actions/);
  assert.match(middle, /completeTask\(openedTask\.id\)/);
  assert.match(middle, /deleteTask\(openedTask\.id\)/);
  assert.match(middle, /Открыть диалог с ИИ/);
  assert.match(bottom, /openedTaskSubtasks\.map/);
  assert.match(bottom, /miniapp-focus-show-completed/);
  assert.match(focus, /ref=\{openedTaskContentsScrollRef\} className="miniapp-focus-section-scroller/);
  assert.match(css, /\.miniapp-focus-task-panel--sectioned \.miniapp-focus-section-scroller/);
  assert.match(css, /\.miniapp-focus-task-panel--sectioned \.miniapp-focus-section \{/);
  assert.match(css, /--focus-card-shadow:/);
});

test('light focus cards are white on a transparent shell, dark cards keep custom gradient', async () => {
  const css = await read('../../client/src/styles.css');
  const start = css.indexOf('/* Focus task: three independent reading surfaces');
  assert.ok(start > 0);
  const section = css.slice(start);
  assert.match(section, /padding: 0 !important;/);
  assert.match(section, /background: transparent !important;/);
  assert.match(section, /background: var\(--focus-card-bg\);/);
  assert.match(section, /--focus-card-bg: linear-gradient/);
  assert.match(section, /\.miniapp-shell\.miniapp-light \.miniapp-focus-task-panel--sectioned/);
  assert.match(section, /--focus-card-bg: #fff;/);
  assert.match(section, /background: #fff;/);
  assert.match(section, /--focus-subtask-bg: #f8f9fd;/);
  assert.match(section, /box-shadow: var\(--focus-card-shadow\);/);
  assert.match(section, /@media \(max-width: 639px\)/);
  assert.match(section, /padding-inline: \.62rem;/);
  assert.match(section, /padding-bottom: max\(1rem, env\(safe-area-inset-bottom\)\)/);
  assert.match(section, /miniapp-focus-task-panel--settings-open \.miniapp-task-settings-panel/);
});

test('focus description confines long links and scrolling within the resizable surface', async () => {
  const css = await read('../../client/src/styles.css');
  const start = css.indexOf('/* The older Mini App preview forces min-height');
  assert.ok(start > 0, 'The overriding focus-specific rule must exist');
  const boundary = css.slice(start, start + 950);
  assert.match(boundary, /\.miniapp-focus-description-surface > \.task-description-preview\.miniapp-task-description-preview/);
  assert.match(boundary, /min-height: 0 !important;/);
  assert.match(boundary, /max-height: 100% !important;/);
  assert.match(boundary, /overflow-y: auto !important;/);
  assert.match(boundary, /overflow-wrap: anywhere;/);
  assert.match(css, /\.miniapp-focus-description-surface a \{/);
});

test('the description heading matches subtask title size and weight on desktop and mobile', async () => {
  const css = await read('../../client/src/styles.css');
  assert.match(css, /\.miniapp-focus-description-heading \{[\s\S]*?font-size: 1\.02rem;[\s\S]*?font-weight: 740;/);
  assert.match(css, /\.miniapp-focus-section-subtasks h3 \{[\s\S]*?font-size: 1\.02rem;[\s\S]*?font-weight: 740;/);
  assert.match(css, /\.miniapp-focus-section-subtasks h3,\s*\.miniapp-shell \.miniapp-focus-task-panel--sectioned \.miniapp-focus-description-heading \{\s*font-size: \.96rem;/);
});
