import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const entry = read('../src/main.tsx');
const testPage = read('../src/TestPage.tsx');
const styles = read('../src/TestPage.css');
const planner = read('../src/App.tsx');

test('Test Page is an opt-in route and preserves the default planner and Economic routes', () => {
  assert.match(entry, /const TestPage = React\.lazy/);
  assert.match(entry, /const isTestPageRoute =/);
  assert.match(entry, /test-page\|test%20page/);
  assert.match(entry, /isTestPageRoute\s*\?\s*<TestPage/);
  assert.match(entry, /isEconomicRoute\s*\?\s*<EconomicApp/);
  assert.match(entry, /:\s*<App \/>/);
});

test('dashboard uses live task, sector, credits, subscriptions and notes data', () => {
  for (const method of ['getTasks', 'getSpheres', 'getMe', 'getCreditUsageStatistics', 'getSubscriptionLinks']) {
    assert.match(testPage, new RegExp('api\\.' + method + '\\('));
  }
  assert.match(testPage, /<StandaloneNotesWorkspace/);
  assert.match(testPage, /<SectorEditor/);
  assert.match(testPage, /<TaskEditor/);
  assert.match(testPage, /<FocusedTaskWindowFrame/);
  assert.match(testPage, /<PlanikMascot/);
  assert.doesNotMatch(testPage, /mockTasks|mockCredits|dummyTask|fakeBalance/);
});

test('Focus stays inside Test Page and opens full task AI chat with Luna by default', () => {
  const chat = read('../src/TestPageChat.tsx');
  assert.match(testPage, /Спросить ИИ/);
  assert.match(testPage, /<FocusedTaskWindowFrame/);
  assert.match(testPage, /<TaskDescriptionInput[^>]+richInlineEditing/);
  assert.match(testPage, /focusSubtaskSort/);
  assert.match(chat, /<TestPageTaskProposal/);
  assert.match(chat, /<TestPageFinanceProposal/);
  assert.match(chat, /<WorkAiMessageBody/);
  assert.match(chat, /'gpt-6-luna'/);
  assert.match(chat, /api\.askTaskAssistant/);
  assert.match(chat, /api\.getTaskAssistantHistory/);
});
test('settings and proposals stay on Test Page with reusable services and separate edit dialogs', () => {
  const settings = read('../src/TestPageSettings.tsx');
  const proposals = read('../src/TestPageProposalCards.tsx');
  assert.match(testPage, /<TestPageSettings/);
  assert.match(testPage, /is-overdue/);
  assert.match(settings, /<AiCheckupScheduleSettings/);
  assert.match(settings, /api\.updateUserSettings/);
  assert.match(proposals, /function EditModal/);
  assert.match(proposals, /api\.approveAiTaskProposal/);
  assert.match(proposals, /api\.setAiTaskProposalPreference/);
  assert.match(proposals, /\/preferences/);
});

test('blue Test Page theme is isolated from the Economic golden theme and mobile friendly', () => {
  assert.match(styles, /\.tp-root\s*\{/);
  assert.match(styles, /--tp-accent:/);
  assert.match(styles, /\.tp-light\s*\{/);
  assert.match(styles, /@media \(max-width:720px\)/);
  assert.doesNotMatch(styles, /\.econ-root\s*\{/);
});


test('Focus resizes a bounded description, persists size per user and opens Test Page subtask editor', () => {
  const taskDialog = read('../src/TestPageTaskDialog.tsx');
  const resizable = read('../src/components/ResizableDescriptionSurface.tsx');
  assert.match(testPage, /<ResizableDescriptionSurface/);
  assert.match(testPage, /storageKey=\{'btm:'\+user\?\.id\+':test-page:focus-description-height'\}/);
  assert.match(testPage, /maxHeight=\{320\}/);
  assert.match(testPage, /onClick=\{\(\) => setTestTaskDialog\(\{parentTask:focusTask\}\)\}/);
  assert.match(testPage, /<TestPageTaskDialog/);
  assert.match(testPage, /Настроить задачу/);
  assert.match(testPage, /setTestTaskDialog\(\{task\}\)/);
  assert.match(resizable, /localStorage\.setItem/);
  assert.match(taskDialog, /<TaskDescriptionInput/);
  assert.match(taskDialog, /buildManualRecurrence/);
  assert.match(taskDialog, /aiMonitoringEnabled/);
  assert.match(taskDialog, /notifyBeforeMinutes/);
  assert.match(taskDialog, /collaborationScope/);
});
test('AI chat windows are layered and offer the classic capability catalog in Test Page style', () => {
  const chat = read('../src/TestPageChat.tsx');
  const capabilities = read('../src/TestPageCapabilities.tsx');
  const welcome = read('../src/components/AiChatWelcome.tsx');
  assert.match(chat, /tp-chat-modal-backdrop/);
  assert.match(chat, /tp-chat-capabilities-button/);
  assert.match(chat, /<TestPageCapabilities kind=\{task\?'task':'general'\}/);
  assert.match(capabilities, /generalGroups, taskGroups/);
  assert.match(welcome, /export const taskGroups/);
  assert.match(welcome, /export const generalGroups/);
  assert.match(styles, /width:min\(1060px/);
  assert.match(styles, /z-index:470/);
});
test('theme-specific scrollbars, Notes and task chips use Test Page contrast variables', () => {
  assert.match(styles, /--tp-scroll-thumb:/);
  assert.match(styles, /scrollbar-color:var\(--tp-scroll-thumb\) var\(--tp-scroll-track\)/);
  assert.match(styles, /color-scheme:light/);
  assert.match(styles, /\.tp-notes-area \.standalone-note-card/);
  assert.match(styles, /\.tp-root\.tp-light \.tp-proposal/);
  assert.match(styles, /\.tp-root \.tp-secondary/);
  assert.match(styles, /\.tp-task-row\.is-overdue[\s\S]*?box-shadow:none/);
});
