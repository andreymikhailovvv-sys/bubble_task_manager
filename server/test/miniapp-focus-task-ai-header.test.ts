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
  assert.match(focus, /На весь экран/);
  assert.match(focus, /miniapp-focus-primary-actions/);
  assert.match(focus, /completeTask\(openedTask\.id\)/);
  assert.match(focus, /deleteTask\(openedTask\.id\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1\.9fr\) minmax\(0, \.9fr\)/);
  assert.match(focus, /<Paperclip size=\{15\}/);
  assert.match(focus, /miniapp-focus-subtask-add-button/);
});

test('completed subtasks toggle at bottom with count and preserve checked state handling', async () => {
  const mini = await read('../../client/src/MiniApp.tsx');
  const from = mini.indexOf('className="miniapp-focus-subtasks mt-4');
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
