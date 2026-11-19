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


test('Focus resizes bounded description and keeps Test Page subtask creation settings', () => {
  const taskDialog = read('../src/TestPageTaskDialog.tsx');
  const resizable = read('../src/components/ResizableDescriptionSurface.tsx');
  assert.match(testPage, /<ResizableDescriptionSurface/);
  assert.match(testPage, /storageKey=\{'btm:'\+user\?\.id\+':test-page:focus-description-height'\}/);
  assert.match(testPage, /maxHeight=\{320\}/);
  assert.match(testPage, /onClick=\{\(\) => setTestTaskDialog\(\{parentTask:focusTask\}\)\}/);
  assert.match(testPage, /<TestPageTaskDialog/);
  assert.match(testPage, /Настроить задачу/);
  assert.match(testPage, /setSubtaskFocusId\(task\.id\)/);
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


test('top global search reuses the interactive planner component and opens tasks, subtasks and notes', () => {
  const original = read('../src/components/WorkspaceGlobalSearch.tsx');
  assert.match(testPage, /<WorkspaceGlobalSearch key=\{user\.id\}/);
  assert.match(testPage, /tasks=\{tasks\.filter\(task=>!task\.parentTaskId\)\} subtasks=\{subtasks\}/);
  assert.match(testPage, /onOpenSubtask=\{task=>setSubtaskFocusId\(task\.id\)\}/);
  assert.match(testPage, /onOpenNote=\{id=>\{setRequestedNote/);
  assert.match(testPage, /requestedNote=\{requestedNote\}/);
  assert.match(original, /searchWorkspace\(tasks, subtasks, indexedNotes, value\)/);
  assert.match(original, /api\.getStandaloneNotes\(/);
});
test('overview quick filter matches task titles and descriptions and habits use real API', () => {
  const habits = read('../src/TestPageHabits.tsx');
  assert.match(testPage, /tp-overview-search-toggle/);
  assert.match(testPage, /matchesWorkspaceText\(task\.title/);
  assert.match(testPage, /<TestPageHabits key=\{user\.id\}/);
  assert.match(habits, /api\.getHabits\(/);
  assert.match(habits, /api\.completeHabit/);
  assert.match(habits, /api\.uncompleteHabit/);
  assert.match(habits, /<MiniAppHabitTracker/);
});
test('task and subtask settings use native selects and expose only relevant fields', () => {
  const dialog = read('../src/TestPageTaskDialog.tsx');
  assert.match(dialog, /<select id="tp-task-sphere"/);
  assert.match(dialog, /<select id="tp-task-importance"/);
  assert.match(dialog, /<select id="tp-task-reminder"/);
  assert.match(dialog, /<select id="tp-task-collaboration-scope"/);
  assert.doesNotMatch(dialog, /<CustomSelect/);
  assert.doesNotMatch(dialog, />Статус</);
  assert.doesNotMatch(dialog, />Срочность</);
  assert.doesNotMatch(dialog, />Место</);
  assert.doesNotMatch(dialog, />ИИ-уведомления</);
  assert.doesNotMatch(dialog, /Дополнительно|onAdvanced/);
  assert.match(dialog, /if\(isSubtask\)/);
  assert.match(dialog, /\{!isSubtask&&/);
  assert.match(dialog, /notifyBeforeMinutes/);
  assert.match(styles, /\.tp-task-settings-row select\.tp-task-native-select/);
});
test('subtask click opens its own focus and settings separately', () => {
  const subtask = read('../src/TestPageSubtaskFocus.tsx');
  assert.match(testPage, /task\.parentTaskId \? setSubtaskFocusId\(task\.id\)/);
  assert.match(testPage, /<TestPageSubtaskFocus/);
  assert.match(subtask, /Настроить подзадачу/);
  assert.match(subtask, /<TaskDescriptionInput/);
  assert.match(subtask, /<ResizableDescriptionSurface/);
  assert.match(subtask, /onToggleComplete/);
});
test('inline Notes uses an external centered editor portal without changing classic defaults', () => {
  const notes = read('../src/components/StandaloneNotesWorkspace.tsx');
  assert.match(testPage, /editorOutsideInline onClose/);
  assert.match(notes, /editorOutsideInline = false/);
  assert.match(notes, /inlineTarget=\{mode === 'inline' && !editorOutsideInline \? inlineMount : undefined\}/);
  assert.match(styles, /body:has\(\.tp-root\.tp-light\) \.notes-editor-backdrop/);
});
test('task list filter selectors are portalled with explicit theme', () => {
  assert.match(testPage, /className="tp-filter-select" detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu"/);
  assert.match(styles, /body:has\(\.tp-root\.tp-light\) \.tp-dropdown-menu\[data-theme="light"\]/);
});


test('Test Page creates ordinary tasks with the same compact settings as task editing', () => {
  assert.match(testPage, /onClick=\{\(\) => user \? setTestTaskDialog\(\{\}\)/);
  assert.match(testPage, /onClick=\{\(\) => setTestTaskDialog\(\{\}\)\}/);
  assert.match(testPage, /<TestPageTaskDialog/);
  assert.match(styles, /\.tp-root \.tp-task-settings-dialog \{\s*height:auto/);
});
test('Focus without subtasks and new subtask settings fit their actual content', () => {
  assert.match(testPage, /tp-focus-dialog.*tp-focus-empty/);
  assert.match(styles, /\.tp-root \.tp-focus-dialog\.tp-focus-empty/);
  assert.match(styles, /\.tp-root \.tp-task-settings-form \{flex:0 1 auto/);
});
test('habit tracker is compact and supports creation, settings, schedule and deletion', () => {
  const habits = read('../src/TestPageHabits.tsx');
  const dialog = read('../src/TestPageHabitDialog.tsx');
  assert.match(habits, /<MiniAppHabitTracker/);
  assert.match(habits, /<TestPageHabitDialog/);
  assert.match(habits, /api\.createHabit/);
  assert.match(habits, /api\.updateHabit/);
  assert.match(habits, /api\.deleteHabit/);
  assert.match(dialog, /Повторов в день/);
  assert.match(dialog, /Уведомления/);
  assert.match(dialog, /Дни недели/);
  assert.match(dialog, /До даты/);
  assert.match(dialog, /По количеству повторов/);
  assert.match(styles, /\.tp-root \.tp-habit-detail \.miniapp-habit-tracker-calendar/);
});
test('overview task filter is inline left of the search icon without duplicate clear', () => {
  assert.match(testPage, /tp-overview-search-field tp-overview-search-inline/);
  assert.match(testPage, /type="text" autoFocus value=\{overviewQuery\}/);
  assert.match(styles, /\.tp-root \.tp-overview-search-field\.tp-overview-search-inline/);
  assert.match(styles, /\.tp-root input:focus/);
});
test('system notifications use shared backend feed, left toast, chat and mascot counter', () => {
  const chat = read('../src/TestPageChat.tsx');
  assert.match(testPage, /api\.getSystemNotifications\(\)/);
  assert.match(testPage, /api\.markSystemNotificationsRead\(\)/);
  assert.match(testPage, /showBrowserSystemNotification/);
  assert.match(testPage, /tp-system-notice-toast/);
  assert.match(testPage, /notificationCount=\{unreadCount\}/);
  assert.match(chat, /tp-chat-system-notice/);
  assert.match(testPage, /onActivityChange=\{setAssistantActivity\}/);
});
test('AI composer shares classic attachment tiles, clipboard paste and streaming statuses', () => {
  const chat = read('../src/TestPageChat.tsx');
  const mascot = read('../src/components/PlanikMascot.tsx');
  assert.match(chat, /<AiAttachmentTiles/);
  assert.match(chat, /<AiMessageAttachments/);
  assert.match(chat, /clipboardImageFiles/);
  assert.match(chat, /<Paperclip size=\{18\}/);
  assert.match(chat, /<VoiceInputButton/);
  assert.match(chat, /api\.askAiChatStreaming/);
  assert.match(chat, /api\.askTaskAssistantStreaming/);
  assert.match(chat, /<AiProgress status=\{progress\}/);
  assert.match(mascot, /isThinking/);
});
test('subtask completion bar is shared by overview and task listing and today includes subtasks', () => {
  assert.match(testPage, /const todayTasks = \[\.\.\.rootTasks,\.\.\.subtasks\]/);
  assert.match(testPage, /const subtaskProgress = useMemo/);
  assert.match(testPage, /tp-task-subtask-progress-bar/);
  assert.match(styles, /\.tp-root \.tp-task-subtask-progress-bar/);
  assert.match(styles, /\.tp-root \.tp-filters \.tp-filter-select \.custom-select-trigger/);
  assert.match(styles, /\.tp-root \.tp-actions>button\.tp-primary:before/);
});


test('Test Page subtask has completion in header, without working-status stripe', () => {
  const subtask = read('../src/TestPageSubtaskFocus.tsx');
  assert.match(subtask, /tp-subtask-header-actions/);
  assert.match(subtask, /tp-subtask-complete/);
  assert.match(subtask, /onClick=\{\(\)=>void navigate\(onToggleComplete\)\}/);
  assert.doesNotMatch(subtask, /Подзадача в работе|tp-subtask-status/);
  assert.match(testPage, /completing=\{completingTaskId===subtaskFocus\.id\}/);
});

test('Focus task can be completed and reopening a completed task is supported', () => {
  assert.match(testPage, /tp-focus-header-actions/);
  assert.match(testPage, /tp-focus-complete/);
  assert.match(testPage, /isDone\(focusTask\)\?'Вернуть в работу':'Выполнить'/);
  assert.match(testPage, /saveFocusDescription\(\)\.then\(\(\)=>setComplete\(focusTask\)\)/);
});

test('successful task and subtask completion animates before refresh and dismissal', () => {
  assert.match(testPage, /setCompletingTaskId\(task\.id\)/);
  assert.match(testPage, /await new Promise<void>\(resolve=>window\.setTimeout\(resolve,360\)\)/);
  assert.match(testPage, /if \(focusId===task\.id\) setFocusId\(null\)/);
  assert.match(testPage, /if \(subtaskFocusId===task\.id\) setSubtaskFocusId\(null\)/);
  assert.match(testPage, /completingTaskId===task\.id\?' is-completing'/);
  assert.match(styles, /@keyframes tp-task-completion-exit/);
  assert.match(styles, /@keyframes tp-completion-dialog-exit/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
});

test('Overview shows live, not fabricated, efficiency rating and breakdown', () => {
  const rating = read('../src/TestPageRating.tsx');
  assert.match(testPage, /<TestPageRating user=\{user\}/);
  assert.match(rating, /user\.efficiencyScore/);
  for (const field of ['efficiencyTaskScore','efficiencyHabitScore','efficiencyAiScore','efficiencyFocusScore']) {
    assert.match(rating, new RegExp('user\\.' + field));
  }
  assert.match(rating, /Рейтинг эффективности/);
  assert.match(rating, /aria-valuemax=\{100\}/);
  assert.match(styles, /\.tp-root \.tp-rating-card/);
});

test('Task and subtask descriptions accept explicit multiline Enter in Focus and settings', () => {
  const taskEditor = read('../src/TestPageTaskDialog.tsx');
  const subtaskEditor = read('../src/TestPageSubtaskFocus.tsx');
  const wrapper = read('../src/components/TaskDescriptionInput.tsx');
  const rich = read('../src/components/InlineRichDescriptionEditor.tsx');
  assert.match(testPage, /richInlineEditing enterCreatesLineBreak/);
  assert.match(taskEditor, /richInlineEditing enterCreatesLineBreak/);
  assert.match(subtaskEditor, /richInlineEditing enterCreatesLineBreak/);
  assert.match(wrapper, /enterCreatesLineBreak=\{enterCreatesLineBreak\}/);
  assert.match(rich, /event\.key === 'Enter'/);
  assert.match(rich, /event\.nativeEvent\.isComposing/);
  assert.match(rich, /range\.insertNode\(br\)/);
  assert.match(rich, /br\.after\(document\.createElement\('br'\)\)/);
  assert.match(rich, /selection\.addRange\(caret\)/);
  assert.match(rich, /emitChange\(\)/);
  assert.match(testPage, /focusDescriptionRef\.current/);
  assert.match(subtaskEditor, /descriptionRef\.current/);
});
