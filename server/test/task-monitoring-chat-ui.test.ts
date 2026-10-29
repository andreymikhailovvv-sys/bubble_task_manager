import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (p: string) => readFile(new URL(p, import.meta.url), 'utf8');

test('one monitoring event creates one visible AI reply plus an unread badge-only event', async () => {
  const [delivery, schema, migration] = await Promise.all([
    read('../src/services/task-monitoring-delivery.service.ts'),
    read('../prisma/schema.prisma'),
    read('../prisma/migrations/20261024013500_monitoring_quick_chat_event_key/migration.sql')
  ]);
  assert.match(delivery, /generalAiMessage\.createMany\(/);
  assert.match(delivery, /monitoringEventKey: eventKey/);
  assert.match(delivery, /skipDuplicates: true/);
  assert.doesNotMatch(delivery, /systemNotification\.createMany/);
  assert.match(delivery, /systemNotification\.create\(/);
  assert.match(delivery, /eventKey,\s*content:/);
  assert.match(delivery, /P2002/);
  assert.match(schema, /monitoringEventKey String\? @unique/);
  assert.match(migration, /GeneralAiMessage_monitoringEventKey_key/);
});

test('monitored AI prioritizes actual help and proactively follows up at requested times', async () => {
  const [ai, worker, tool] = await Promise.all([
    read('../src/services/ai-assistant.service.ts'),
    read('../src/services/task-monitoring-worker.service.ts'),
    read('../src/services/task-monitoring-trigger.service.ts')
  ]);
  assert.match(ai, /Действуй инициативно/);
  assert.match(ai, /СНАЧАЛА сделай доступную полезную работу/);
  assert.match(ai, /Веб-поиск не обязателен/);
  assert.match(worker, /Веб-поиск через web_search МОЖЕШЬ использовать/);
  assert.match(worker, /ЗАГОЛОВОК:/);
  assert.match(ai, /После содержательного ответа поддерживай дальнейшее сопровождение/);
  assert.match(ai, /ОБЯЗАТЕЛЬНО установи триггер/);
  assert.match(ai, /Не заменяй точное пожелание произвольным напоминанием/);
  assert.match(worker, /подготовь полезные материалы, варианты/);
  assert.match(worker, /обычно устанавливай set_task_monitoring_trigger/);
  assert.match(tool, /MUST honor explicit user reminder dates/);
});

test('task-chat settings have a single monitoring entry with badges on all clients', async () => {
  const [app, mini, editor, popup, css] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/TaskEditor.tsx'),
    read('../../client/src/components/TaskMonitoringStatuses.tsx'),
    read('../../client/src/styles.css')
  ]);
  assert.equal((app.match(/<TaskMonitoringStatuses/g) ?? []).length, 4);
  assert.equal((mini.match(/<TaskMonitoringStatuses/g) ?? []).length, 1);
  assert.doesNotMatch(editor, /<TaskMonitoringControls/);
  assert.doesNotMatch(app, /<TaskMonitoringControls/);
  assert.doesNotMatch(mini, /<TaskMonitoringControls/);
  assert.match(popup, /api\.updateTask\(taskId, \{ aiMonitoringEnabled: next \}\)/);
  assert.match(popup, /task-monitor-unread/);
  assert.match(popup, /getTaskMonitoringUnread/);
  assert.match(popup, /markTaskMonitoringSeen/);
  assert.match(css, /\.task-monitor-chat-link/);
});


test('monitoring unread events light up the round Quick AI launcher without duplicate chat bubbles', async () => {
  const [app, delivery] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../src/services/task-monitoring-delivery.service.ts')
  ]);
  assert.match(delivery, /systemNotification\.create\(/);
  assert.match(app, /const visibleNotifications = result.notifications;/);
  assert.match(app, /systemNotifications\.filter\(notification => !notification\.eventKey\?\.startsWith\('monitoring:'\)\)/);
  assert.match(app, /setUnreadSystemNotificationCount\(result\.notifications\.filter\(notification => notification\.readAt == null\)\.length\)/);
  assert.match(app, /unreadSystemNotificationCount > 0 \? <span/);
  assert.match(app, /markSystemNotificationsRead\(\)/);
});

test('expanded task chat has monitoring control to the left of clear button, not floating below icons', async () => {
  const app = await read('../../client/src/App.tsx');
  const expanded = app.slice(app.indexOf('focused-task-ai-expanded-panel relative'), app.indexOf('<AiModelChip value={focusedAiModel}', app.indexOf('focused-task-ai-expanded-panel relative')));
  assert.match(expanded, /<TaskMonitoringStatuses taskId=\{focusedTask\.id\}/);
  assert.ok(expanded.indexOf('<TaskMonitoringStatuses taskId={focusedTask.id}') < expanded.indexOf('onClick={() => void clearFocusedAiDialog()}'));
  assert.doesNotMatch(expanded, /absolute right-5 top-16/);
});

test('monitoring panel uses an accessible pill switch instead of a checkbox', async () => {
  const controls = await read('../../client/src/components/TaskMonitoringControls.tsx');
  assert.match(controls, /role="switch" aria-checked=\{enabled\}/);
  assert.match(controls, /disabled=\{!allowed\}/);
  assert.match(controls, /onClick=\{\(\) => onChange\(!enabled\)\}/);
  assert.match(controls, /Вкл/);
  assert.match(controls, /Выкл/);
  assert.doesNotMatch(controls, /type="checkbox"/);
});


test('focus help header is one compact row with matching teal bot and task monitoring before expand', async () => {
  const [app, css] = await Promise.all([read('../../client/src/App.tsx'), read('../../client/src/styles.css')]);
  const focus = app.slice(app.indexOf('<aside data-tour="feature-focus-ai"'), app.indexOf('      {isFocusModeOpen && isFocusAiExpanded'));
  const header = focus.slice(0, focus.indexOf('focused-task-ai-thread-region'));
  assert.match(header, /focus-task-ai-header flex shrink-0 items-center/);
  assert.match(header, /focus-task-ai-bot-icon/);
  assert.match(css, /\.focus-task-ai-bot-icon \{\s*color: color-mix\(in srgb, var\(--accent\) 80%, var\(--text-primary\)\)/);
  assert.match(header, /<TaskMonitoringStatuses taskId=\{focusActiveTask\.id\}/);
  assert.ok(header.indexOf('Помощь ИИ') < header.indexOf('TaskMonitoringStatuses'));
  assert.ok(header.indexOf('TaskMonitoringStatuses') < header.indexOf('setIsFocusAiExpanded(true)'));
  assert.doesNotMatch(header, /title=\{focusActiveTask\.title\}/);
});

test('fullscreen task and focus dialogs share spaced header, red clear pill and aligned composer', async () => {
  const [app, css] = await Promise.all([read('../../client/src/App.tsx'), read('../../client/src/styles.css')]);
  const focusFull = app.slice(app.indexOf('      {isFocusModeOpen && isFocusAiExpanded'), app.indexOf('      {focusRemainingSeconds > 0'));
  const taskFull = app.slice(app.indexOf('      {focusedTask && isAiExpanded'), app.indexOf('      {isCollaborationSettingsOpen'));
  for (const panel of [focusFull, taskFull]) {
    assert.match(panel, /task-ai-fullscreen-header mb-3 flex/);
    assert.match(panel, /task-ai-fullscreen-monitor shrink-0/);
    assert.match(panel, /task-ai-clear-dialog-button/);
    assert.match(panel, /task-ai-fullscreen-window-actions/);
    assert.match(panel, /focused-task-ai-expanded-panel/);
    assert.match(panel, /focused-task-ai-thread-through/);
    assert.match(panel, /focused-task-ai-composer focused-task-ai-composer-expanded/);
  }
  assert.match(focusFull, /clearTaskAiDialog\(focusActiveTask\.id\)/);
  assert.match(focusFull, /setIsFocusAiSearchOpen/);
  assert.match(focusFull, /title=\{focusActiveTask\.title\}/);
  assert.match(css, /\.task-ai-clear-dialog-button:active:not\(:disabled\)/);
  assert.match(css, /\.task-ai-fullscreen-monitor \{\s*margin-right:/);
  assert.match(css, /\.focused-task-ai-thread-through \{[\s\S]*?scrollbar-width: thin;/);
  assert.match(css, /\.focused-task-ai-composer \{[\s\S]*?pointer-events: none;/);
  assert.match(css, /\.focused-task-ai-composer > \* \{\s*pointer-events: auto;/);
  assert.match(css, /body\[data-theme='dark'\] \.focused-task-ai-composer \{\s*--task-ai-footer-rgb: 15, 23, 42;/);
  assert.doesNotMatch(css, /\.focus-mode-shell \.focus-shared-task-ai-panel \.chat-thread\.focused-task-ai-thread-through \{\s*scrollbar-width: none;/);
  assert.doesNotMatch(css, /\.focus-mode-shell \.focus-shared-task-ai-panel \.focused-task-ai-composer \{[^}]*background: #fff !important;/);
});


test('all four task Help AI views preserve draggable scrolling beneath a translucent footer', async () => {
  const [app, css] = await Promise.all([read('../../client/src/App.tsx'), read('../../client/src/styles.css')]);
  const sections = [
    app.slice(app.indexOf('<aside data-tour="feature-focus-ai"'), app.indexOf('      {isFocusModeOpen && isFocusAiExpanded')),
    app.slice(app.indexOf('      {isFocusModeOpen && isFocusAiExpanded'), app.indexOf('      {focusRemainingSeconds > 0')),
    app.slice(app.indexOf('data-tour="ai-task-help"'), app.indexOf('      {focusedTask && isAiExpanded')),
    app.slice(app.indexOf('      {focusedTask && isAiExpanded'), app.indexOf('      {isCollaborationSettingsOpen'))
  ];
  for (const section of sections) {
    assert.match(section, /className="chat-thread focused-task-ai-thread-through[^"]*overflow-y-auto/);
    assert.match(section, /className="focused-task-ai-composer(?: focused-task-ai-composer-expanded)?"/);
  }
  assert.match(css, /\.focused-task-ai-thread-through::-webkit-scrollbar \{\s*width: 9px;/);
  assert.match(css, /\.focused-task-ai-composer \{[\s\S]*?background: linear-gradient\(to right,/);
  assert.match(css, /\.focused-task-ai-composer::before \{[\s\S]*?mask-image: linear-gradient\(to right,/);
  assert.match(css, /\.focused-task-ai-composer \{[\s\S]*?pointer-events: none;/);
  assert.match(css, /\.focused-task-ai-composer > \* \{\s*pointer-events: auto;/);
  assert.doesNotMatch(css, /\.focus-mode-shell \.focus-shared-task-ai-panel \.chat-thread\.focused-task-ai-thread-through \{\s*scrollbar-width: none;/);
  assert.doesNotMatch(css, /\.focus-mode-shell \.focus-shared-task-ai-panel \.focused-task-ai-composer \{[^}]*background: #fff !important;/);
});
