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
  assert.match(ai, /При включённом автомониторинге поддерживай минимум одно/);
  assert.match(ai, /ОБЯЗАТЕЛЬНО назначь отложенное действие/);
  assert.match(ai, /не заменяй точное пожелание произвольным интервалом/);
  assert.match(worker, /подготовь полезные материалы, варианты/);
  assert.match(worker, /Поддерживай минимум одно запланированное полезное действие/);
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
  assert.match(popup, /api\.updateTask\(taskId, \{ aiMonitoringEnabled: next, aiMonitoringModel: monitorModel \}\)/);
  assert.match(popup, /task-monitor-unread/);
  assert.match(popup, /getTaskMonitoringUnread/);
  assert.match(popup, /markTaskMonitoringSeen/);
  assert.match(css, /\.task-monitor-chat-link/);
});


test('monitoring unread events light up Planik badge without duplicate chat bubbles', async () => {
  const [app, delivery, mascot, mascotStyles] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../src/services/task-monitoring-delivery.service.ts'),
    read('../../client/src/components/PlanikMascot.tsx'),
    read('../../client/src/components/PlanikMascot.css')
  ]);
  assert.match(delivery, /systemNotification\.create\(/);
  assert.match(app, /const visibleNotifications = result.notifications;/);
  assert.match(app, /systemNotifications\.filter\(notification => !notification\.eventKey\?\.startsWith\('monitoring:'\)\)/);
  assert.match(app, /setUnreadSystemNotificationCount\(result\.notifications\.filter\(notification => notification\.readAt == null\)\.length\)/);
  assert.match(app, /<PlanikMascot notificationCount=\{unreadSystemNotificationCount\}/);
  assert.match(mascot, /data-has-notifs=\{count > 0 \? 'true' : 'false'\}/);
  assert.match(mascotStyles, /data-mode="idle"\]\[data-has-notifs="true"\] \.planik-notif-static/);
  assert.match(app, /markSystemNotificationsRead\(\)/);
});


test('Planik overlays the fullscreen composer without moving its input bar', async () => {
  const [expanded, mascotCss, appCss] = await Promise.all([
    read('../../client/src/components/ExpandedAiChat.tsx'),
    read('../../client/src/components/PlanikMascot.css'),
    read('../../client/src/styles.css')
  ]);
  assert.match(expanded, /className="planik-composer-float"[\s\S]{0,320}<\/div> : null\}\s*<div ref=\{composerRef\}/);
  assert.match(appCss, /\.ai-chat-expanded-composer-wrap\s*\{[^}]*position:\s*absolute/);
  assert.doesNotMatch(mascotCss, /\.ai-chat-expanded-composer-wrap\s*\{\s*position:\s*relative/);
  assert.match(mascotCss, /bottom:\s*calc\(0\.75rem \+ var\(--ai-composer-height/);
  assert.match(mascotCss, /\.planik-mascot--launcher\s*\{\s*width:\s*120px/);
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

test('web Planik fires confetti and flash in sync with a stationary shadow and light palette', async () => {
  const [mascot, styles, notes, editor, frame] = await Promise.all([
    read('../../client/src/components/PlanikMascot.tsx'),
    read('../../client/src/components/PlanikMascot.css'),
    read('../../client/src/components/StandaloneNotesWorkspace.tsx'),
    read('../../client/src/components/TaskEditor.tsx'),
    read('../../client/src/components/TaskEditorFrame.tsx')
  ]);

  assert.doesNotMatch(mascot, /МОЛОДЕЦ!/);
  assert.match(mascot, /className="planik-popper-flash"/);
  assert.match(mascot, /className="planik-popper-particle"/);
  assert.match(mascot, /<span className="planik-ground-shadow"/);
  assert.match(styles, /animation: planik-popper-flash [^;\n]* \.55s both/);
  assert.match(styles, /animation: planik-confetti-burst [^;\n]* calc\(\.55s \+ var\(--planik-stagger/);
  assert.match(styles, /planik-ground-shadow\s*\{[\s\S]{0,500}position:\s*absolute/);
  assert.match(styles, /body\[data-theme='light'\] \.planik-body-stop-start/);
  assert.match(notes, /mode === 'widget' && !editing \? \([\s\S]*?planik-notes-companion/);
  assert.match(editor, /showPlanik=\{!task\?\.id && !externalSubtask\}/);
  assert.match(frame, /showPlanik \? <div className="planik-task-editor-companion"/);
});


test('personal modal Planik companions stay bottom-right and react to cursor hover', async () => {
  const [styles, mascot, frame, notes] = await Promise.all([
    read('../../client/src/components/PlanikMascot.css'),
    read('../../client/src/components/PlanikMascot.tsx'),
    read('../../client/src/components/TaskEditorFrame.tsx'),
    read('../../client/src/components/StandaloneNotesWorkspace.tsx')
  ]);
  const positioning = styles.match(/\.planik-notes-companion,\s*\.planik-task-editor-companion\s*\{([^}]+)\}/)?.[1];
  assert.ok(positioning, 'both modal companions must share a positioning rule');
  assert.match(positioning, /position:\s*fixed;/);
  assert.match(positioning, /right:\s*max\(1\.5rem/);
  assert.match(positioning, /bottom:\s*max\(2rem/);
  assert.match(positioning, /pointer-events:\s*auto;/);
  assert.doesNotMatch(positioning, /top:\s*50%|pointer-events:\s*none/);
  assert.match(mascot, /onPointerEnter=\{\(\) => setHovered\(true\)\}/);
  assert.match(mascot, /document\.addEventListener\('pointermove', onPointerMove/);
  assert.match(notes, /className="planik-notes-companion"/);
  assert.match(frame, /className="planik-task-editor-companion"[^>]*onClick=\{event=>event\.stopPropagation\(\)\}/);
});


test('Planik modal hover reveals the same quick chat panel, and typing follows AI activity instead of user keys', async () => {
  const [app, expanded, mascot, mascotStyles] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../../client/src/components/ExpandedAiChat.tsx'),
    read('../../client/src/components/PlanikMascot.tsx'),
    read('../../client/src/components/PlanikMascot.css')
  ]);
  assert.match(app, /planik-quick-ai-preview absolute bottom-\[108px\]/);
  assert.match(app, /sendAiChatQuestion\(true\)/);
  assert.match(mascotStyles, /body:has\(\.planik-notes-companion, \.planik-task-editor-companion\)/);
  assert.match(mascotStyles, /body:has\(\.planik-notes-companion:hover, \.planik-task-editor-companion:hover\)/);
  assert.match(mascotStyles, /\.ai-chat-launcher:not\(\.work-ai-launcher\) \.planik-quick-ai-preview/);
  assert.match(mascotStyles, /\.ai-chat-launcher:not\(\.work-ai-launcher\):focus-within \.planik-quick-ai-preview/);
  assert.doesNotMatch(app, /setQuickAiTypingSignal/);
  assert.doesNotMatch(expanded, /setTypingSignal/);
  assert.match(mascot, /document\.addEventListener\('pointermove', onPointerMove, \{ passive: true \}\)/);
  assert.match(mascot, /window\.requestAnimationFrame\(update\)/);
  assert.match(mascot, /busy \? \(isPainting \? 'painting' : isSearching \? 'searching' : 'typing'\)/);
  assert.match(mascot, /progress === 'generating_image' \|\| progress === 'editing_image'/);
  assert.doesNotMatch(mascot, /setTyping\(true\)/);
  assert.doesNotMatch(mascot, /typingText|priorDraft/);
});


test('Planik badge detaches at the real unread reset, and only the desktop workspace launcher is reduced', async () => {
  const [mascot, styles, app] = await Promise.all([
    read('../../client/src/components/PlanikMascot.tsx'),
    read('../../client/src/components/PlanikMascot.css'),
    read('../../client/src/App.tsx')
  ]);
  assert.doesNotMatch(mascot, /planik-phone/);
  assert.match(mascot, /const priorNotificationCount = useRef\(initialCount\)/);
  assert.match(mascot, /if \(previous <= 0\) return;/);
  assert.match(mascot, /setClearingCount\(previous\)/);
  assert.match(mascot, /setClearingCount\(null\), 1660/);
  assert.match(mascot, /className="planik-notif-take-arm"/);
  assert.match(mascot, /className="planik-notif-flying"/);
  assert.match(mascot, /className="planik-notif-static"/);
  assert.match(mascot, /cx="190" cy="162" rx="10" ry="15"/);
  assert.match(mascot, /cx="240" cy="162" rx="10" ry="15"/);
  assert.match(styles, /@keyframes planik-notif-peel/);
  assert.match(styles, /@keyframes planik-notif-reach/);
  assert.match(styles, /@keyframes planik-notif-toss/);
  assert.match(styles, /data-mode="clearing"\] \.planik-notif-take-arm/);
  assert.match(styles, /data-mode="clearing"\] \.planik-notif-flying/);
  assert.match(styles, /ai-chat-launcher:not\(\.work-ai-launcher\):not\(\.ai-chat-launcher-task-open\):not\(\.bubble-ai-fullscreen\)/);
  assert.match(styles, /right: 410px/);
  assert.match(styles, /width: 108px;\s*height: 96px;/);
  assert.match(styles, /\.planik-quick-ai-preview \{\s*bottom: 96px/);
  assert.match(app, /setUnreadSystemNotificationCount\(0\)/);
});
