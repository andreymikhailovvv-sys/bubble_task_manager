import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { newestFocusSubtaskFirst, urgentFocusSubtaskFirst } from '../../client/src/lib/focusSubtaskSort.js';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('Telegram Mini App and compact mobile browser render the same workspace component', async () => {
  const [entry, mini, sort] = await Promise.all([
    read('../../client/src/main.tsx'),
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/lib/focusSubtaskSort.ts')
  ]);
  assert.match(entry, /isMiniAppRoute\s*\?\s*<MiniApp runtime="telegram"\s*\/>/);
  assert.match(entry, /isCompactWorkspaceViewport\s*\?\s*<MiniApp runtime="web"\s*\/>/);
  assert.match(mini, /if \(openedTaskSubtaskFilterMode === 'none'\) return newestFocusSubtaskFirst\(a, b\)/);
  assert.match(mini, /if \(openedTaskSubtaskFilterMode === 'urgency'\) return urgentFocusSubtaskFirst\(a, b\)/);
  assert.match(sort, /createdAtTimestamp\(b\) - createdAtTimestamp\(a\)/);
  const old = { id: 'old', createdAt: '2026-10-01T00:00:00Z', dueDate: null };
  const fresh = { id: 'fresh', createdAt: '2026-10-19T00:00:00Z', dueDate: null };
  assert.deepEqual([old, fresh].sort(newestFocusSubtaskFirst).map(item => item.id), ['fresh', 'old']);
  assert.deepEqual([old, fresh].sort(urgentFocusSubtaskFirst).map(item => item.id), ['fresh', 'old']);
});

test('compact toolbar retains postponed actions and accessible filters; notes move to the bottom navigation', async () => {
  const [mini, toolbar, styles] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/MiniWorkspaceTools.tsx'),
    read('../../client/src/styles.css')
  ]);
  assert.equal((mini.match(/<MiniWorkspaceTools/g) ?? []).length, 2);
  assert.match(toolbar, /miniapp-workspace-tools-compact/);
  assert.doesNotMatch(toolbar, /miniapp-workspace-tool-notes|onNotesOpen/);
  assert.match(mini, /miniapp-bottom-navigation/);
  assert.match(mini, /<span>Заметки<\/span>/);
  assert.match(toolbar, /disabled aria-disabled="true"/);
  assert.match(toolbar, /aria-label="Фильтры задач"/);
  assert.match(toolbar, /aria-expanded=\{open\}/);
  assert.match(toolbar, /onTimeFilterChange\('all'\)/);
  assert.match(toolbar, /onSelectAllSpheres\(true\)/);
  assert.match(toolbar, /onTimelineSphereChange\('all'\)/);
  assert.match(toolbar, /onPointerDown/);
  assert.match(toolbar, /onEscape/);
  assert.match(styles, /\.miniapp-workspace-filter-panel/);
  assert.doesNotMatch(mini, /isListSphereFilterOpen/);
});

test('workspace tools remain below dialogs and the credits popover on both compact surfaces', async () => {
  const [mini, toolbar, css] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/MiniWorkspaceTools.tsx'),
    read('../../client/src/styles.css')
  ]);
  const toolbarRule = css.match(/\.miniapp-workspace-tools \{([^}]+)\}/)?.[1] ?? '';
  const openRule = css.match(/\.miniapp-workspace-tools\.is-filter-menu-open \{([^}]+)\}/)?.[1] ?? '';
  const normalLayer = Number(toolbarRule.match(/z-index:\s*(\d+)/)?.[1]);
  const openLayer = Number(openRule.match(/z-index:\s*(\d+)/)?.[1]);
  const headerLayer = Number(mini.match(/relative z-(\d+) miniapp-premium-topbar rounded-xl/)?.[1]);
  const createTaskLayer = Number(mini.match(/miniapp-slide-backdrop fixed inset-0 z-(\d+) flex items-end/)?.[1]);
  assert.equal(normalLayer, 1);
  assert.ok(normalLayer < openLayer && openLayer < headerLayer);
  assert.ok(openLayer < createTaskLayer);
  assert.match(mini, /miniapp-credit-popover absolute right-0 top-full z-\[60\]/);
  assert.match(toolbar, /open \? 'is-filter-menu-open'/);
  assert.match(toolbar, /miniapp-workspace-filter-panel absolute right-0[^"]*z-\[180\]/);
});

test('compact toolbar retains themed controls and bottom navigation in both themes', async () => {
  const [toolbar, css] = await Promise.all([
    read('../../client/src/components/MiniWorkspaceTools.tsx'),
    read('../../client/src/styles.css')
  ]);
  assert.match(toolbar, /miniapp-workspace-tool-filter/);
  assert.match(toolbar, /miniapp-workspace-tool-optimize/);
  assert.match(toolbar, /disabled aria-disabled="true"/);
  assert.match(css, /\.miniapp-workspace-tool \{[^}]*background: rgba\(100, 116, 139, \.16\);[^}]*color: #cbd5e1;/);
  assert.match(css, /\.miniapp-workspace-tool-optimize \{[^}]*background: rgba\(244, 63, 94, \.15\);[^}]*color: #fda4af;/);
  assert.match(css, /\.miniapp-shell\.miniapp-light \.miniapp-bottom-navigation/);
  assert.match(css, /\.miniapp-shell \.miniapp-workspace-tools-compact/);
});

test('compact and Telegram notes share web CRUD, grouping, autosave and rich-text editor', async () => {
  const [mini, board, group, notesApi] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/StandaloneNotesWorkspace.tsx'),
    read('../../client/src/components/StandaloneNoteGroupManager.tsx'),
    read('../../client/src/lib/api.ts')
  ]);
  assert.match(mini, /<StandaloneNotesWorkspace key=\{currentUser\.id\} userId=\{currentUser\.id\}/);
  assert.match(mini, /mode="mobile" onClose=\{\(\) => \{ setIsStandaloneNotesOpen\(false\); setRequestedStandaloneNote\(null\); \}\}/);
  assert.match(board, /setBoardOpen\(mode === 'mobile'\)/);
  assert.match(board, /api\.getStandaloneNotes\(\)/);
  assert.match(board, /api\.getStandaloneNoteGroups\(\)/);
  assert.match(board, /api\.createStandaloneNote\(/);
  assert.match(board, /api\.updateStandaloneNote\(/);
  assert.match(board, /api\.deleteStandaloneNote\(/);
  assert.match(board, /<StandaloneNoteGroupManager/);
  assert.match(board, /<NotesEditor/);
  assert.match(group, /onDelete/);
  assert.match(notesApi, /getStandaloneNotes:/);
});

test('fresh mobile browser navigations receive current app HTML rather than cached entrypoint', async () => {
  const server = await read('../src/index.ts');
  assert.match(server, /index: false/);
  assert.match(server, /endsWith\('\.html'\)/);
  assert.match(server, /'Cache-Control', 'no-store, must-revalidate'/);
  assert.match(server, /app\.get\('\*'/);
});


test('Telegram fullscreen uses safe insets and bottom tabs replace the old display switch', async () => {
  const [mini, tools, styles] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/MiniWorkspaceTools.tsx'),
    read('../../client/src/styles.css')
  ]);
  assert.equal((mini.match(/<MiniWorkspaceTools/g) ?? []).length, 2);
  assert.equal((mini.match(/onPostpone=\{\(\) => void postponeAllOverdueToToday\(\)\}/g) ?? []).length, 2);
  assert.doesNotMatch(tools, /display-mode-toggle-group|onDisplayModeChange/);
  assert.match(mini, /webApp\.requestFullscreen\?\.\(\)/);
  assert.match(mini, /safeAreaChanged/);
  assert.match(mini, /contentSafeAreaChanged/);
  assert.match(mini, /const fullscreenClass = isTelegramRuntime/);
  assert.match(mini, /aria-label="Разделы Планировыча"/);
  assert.match(mini, /<span>Список<\/span>/);
  assert.match(mini, /<span>Таймлайн<\/span>/);
  assert.match(mini, /<span>Чат с ИИ<\/span>/);
  assert.match(mini, /<span>Заметки<\/span>/);
  assert.match(mini, /setDisplayMode\('list'\)/);
  assert.match(mini, /setDisplayMode\('timeline'\)/);
  assert.match(mini, /setIsAiChatOpen\(true\)/);
  assert.match(mini, /setIsStandaloneNotesOpen\(true\)/);
  assert.match(styles, /\.miniapp-shell\.miniapp-telegram-fullscreen/);
  assert.match(styles, /\.miniapp-bottom-navigation/);
  assert.match(styles, /\.miniapp-workspace-tools-compact/);
  assert.match(mini, /miniapp-timeline-independent-blocks/);
  assert.match(mini, /miniapp-premium-habits/);
});

test('timeline has independent layout blocks while keeping original controls and date grid', async () => {
  const [mini, styles, actions] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/styles.css'),
    read('../../client/src/components/MiniWorkspaceTools.tsx')
  ]);
  const start = mini.indexOf('<section className="miniapp-timeline-section miniapp-timeline-independent-blocks">');
  const end = mini.indexOf('className={`miniapp-calendar-grid miniapp-calendar-grid-', start);
  assert.ok(start >= 0 && end > start, 'timeline layout should precede the unchanged calendar grid');
  const timeline = mini.slice(start, end);
  assert.match(timeline, /miniapp-timeline-actions-panel/);
  assert.match(timeline, /miniapp-timeline-view-panel/);
  assert.match(timeline, /miniapp-timeline-period-panel/);
  assert.doesNotMatch(timeline, /miniapp-premium-timeline|miniapp-workspace-toolbar-card/);
  assert.match(timeline, /<MiniWorkspaceTools/);
  assert.match(timeline, /timelineView === view/);
  assert.match(timeline, /moveTimelinePeriod\(-1\)/);
  assert.match(timeline, /moveTimelinePeriod\(1\)/);
  assert.match(actions, /<Clock3 size=\{16\}/);
  assert.match(actions, /<Sparkles size=\{16\}/);
  assert.match(actions, /<ListFilter size=\{16\}/);
  assert.match(styles, /\.miniapp-shell \.miniapp-timeline-section\.miniapp-timeline-independent-blocks/);
  assert.match(styles, /\.miniapp-timeline-independent-blocks > \.miniapp-timeline-actions-panel/);
  assert.match(styles, /\.miniapp-timeline-view-panel/);
});

test('timeline, AI chat and notes fullscreen surfaces have safe top treatment', async () => {
  const [mini, styles, notes] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/styles.css'),
    read('../../client/src/components/StandaloneNotesWorkspace.tsx')
  ]);
  assert.match(styles, /\.miniapp-shell\.miniapp-telegram-fullscreen \.miniapp-timeline-section\.miniapp-timeline-independent-blocks \{\s*margin-top: \.75rem;/);
  assert.match(styles, /\.miniapp-shell\.miniapp-telegram-fullscreen \.miniapp-ai-chat-panel-general \{\s*padding-top: 0;/);
  assert.match(styles, /\.miniapp-ai-chat-panel-general::before \{[\s\S]*?pointer-events: none;/);
  assert.match(styles, /height: calc\(var\(--miniapp-top-inset, 0px\) \+ \.35rem\)/);
  assert.match(styles, /\.miniapp-ai-chat-header-general \{\s*background: rgba\(11, 18, 34, \.8\)/);
  assert.match(styles, /padding-top: calc\(var\(--miniapp-top-inset, 0px\) \+ var\(--miniapp-ai-header-height\) \+ \.75rem\)/);
  assert.match(mini, /updateAiChatHeaderVisibility\(container\.scrollTop/);
  assert.match(styles, /body\[data-theme='light'\] \.standalone-notes-mobile \{\s*background: #fff !important;/);
  assert.match(notes, /mobileSafeAreaTop\?: number/);
});

test('Telegram fullscreen chat compact header and scroll-aware notes preserve mobile web', async () => {
  const [mini, css, notes] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/styles.css'),
    read('../../client/src/components/StandaloneNotesWorkspace.tsx')
  ]);
  assert.match(mini, /useTelegramCompactChatHeader = isTelegramRuntime && telegramViewport\.fullscreen/);
  assert.match(mini, /miniapp-ai-chat-header-telegram/);
  assert.match(mini, /miniapp-ai-chat-inline-heading/);
  assert.match(mini, /miniapp-ai-chat-inline-title/);
  assert.match(mini, /miniapp-ai-chat-telegram-project/);
  assert.match(mini, /!useTelegramCompactChatHeader \? \(/);
  assert.match(css, /\.miniapp-ai-chat-panel-general::before \{\s*height: calc\(var\(--miniapp-top-inset, 0px\) \+ 3\.65rem\)/);
  assert.match(css, /\.miniapp-ai-chat-header-general\.miniapp-ai-chat-header-telegram/);
  assert.match(css, /\.miniapp-ai-chat-inline-title h2/);
  assert.match(css, /\.miniapp-ai-chat-telegram-project \{/);
  assert.match(mini, /telegramMiniApp=\{isTelegramRuntime\}/);
  assert.match(notes, /if \(mode !== 'mobile'\) return;/);
  assert.match(notes, /notesFiltersVisible/);
  assert.match(notes, /onScroll=\{handleNotesScroll\}/);
  assert.match(notes, /standalone-notes-filters-collapsed/);
  assert.match(css, /\.standalone-notes-telegram \.standalone-notes-board-filters\.standalone-notes-filters-collapsed/);
  assert.match(css, /body\[data-theme='light'\] \.standalone-notes-mobile\.standalone-notes-telegram/);
  assert.match(css, /\.miniapp-bottom-navigation-item\.is-active \.miniapp-bottom-navigation-icon/);
  assert.match(mini, /event\.currentTarget\.blur\(\)/);
});

test('Telegram native selectors and safe-area colors do not alter mobile web chat', async () => {
  const [mini, notes, css] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/StandaloneNotesWorkspace.tsx'),
    read('../../client/src/styles.css')
  ]);
  assert.match(mini, /telegramChatPicker/);
  assert.match(mini, /role="menuitemradio"/);
  assert.match(mini, /setActiveAiChatId\(chat.id\)/);
  assert.match(mini, /setActiveAiChatProjectId\(project.id\)/);
  assert.match(mini, /miniapp-ai-chat-title-trigger/);
  assert.match(mini, /miniapp-telegram-project-trigger/);
  assert.match(mini, /useTelegramCompactChatHeader && telegramChatPicker/);
  assert.match(mini, /!useTelegramCompactChatHeader \? \(/);
  assert.match(mini, /showTelegramBrand/);
  assert.match(mini, /isAiChatOpen \|\| isStandaloneNotesOpen\) setIsSearchBarFloating\(false\)/);
  assert.match(css, /\.miniapp-telegram-picker-option/);
  assert.match(css, /\.miniapp-shell\.miniapp-telegram-fullscreen::before/);
  assert.match(css, /\.miniapp-ai-chat-panel-general\.miniapp-ai-header-collapsed/);
  assert.match(css, /backdrop-filter: none !important/);
  assert.match(notes, /notesLastToggleAtRef/);
  assert.match(notes, /standalone-notes-telegram-brand/);
  assert.match(css, /\.standalone-notes-telegram-brand/);
});

test('Telegram project picker, navigation and attachment theme refinements remain isolated', async () => {
  const [mini, css] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/styles.css')
  ]);
  // Project icons use the SVG already rendered in the full-size sidebar.
  assert.match(mini, /miniapp-telegram-picker-project-icon[^\n]*project\.icon === 'telegram' \? <svg/);
  assert.doesNotMatch(mini, /project\.icon === 'telegram' \? '✈'/);
  // Telegram WebView uses focus-safe accessible controls; mobile web remains a button.
  assert.match(mini, /MiniNavigationControl = isTelegramRuntime \? 'div' : 'button'/);
  assert.match(mini, /handleMiniNavigationKeyDown/);
  assert.equal((mini.match(/<MiniNavigationControl role=/g) ?? []).length, 4);
  assert.match(css, /\.miniapp-shell\.miniapp-telegram-fullscreen \.miniapp-bottom-navigation-item \{/);
  assert.match(css, /-webkit-tap-highlight-color: transparent !important/);
  // Miniapp side menu is below Telegram system controls.
  assert.match(css, /\.miniapp-shell\.miniapp-telegram-fullscreen \.miniapp-ai-chat-menu \{[\s\S]*?padding-top: calc\(var\(--miniapp-top-inset, 0px\) \+ \.7rem\)/);
  // Menus transition with transforms rather than animating layout height.
  assert.match(css, /@keyframes miniapp-telegram-picker-appear/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  // General chat attach button is themed independently of light mode.
  assert.match(css, /\.miniapp-shell:not\(\.miniapp-light\) \.miniapp-ai-chat-panel-general \.miniapp-ai-chat-attach \{/);
});

test('fullscreen search and all four tabs respect safe areas and keep the shared navigation', async () => {
  const [mini, styles, notes] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/styles.css'),
    read('../../client/src/components/StandaloneNotesWorkspace.tsx')
  ]);
  assert.match(mini, /ref=\{searchBarSlotRef\} className="miniapp-premium-topbar-slot"/);
  assert.match(mini, /section ref=\{searchBarPanelRef\} className=\{\`relative z-30 miniapp-premium-topbar/);
  assert.match(mini, /isSearchBarFloating && \(isHeaderVisible \|\| isGlobalSearchOpen\)/);
  assert.match(mini, /originalSearchIsPastTop/);
  assert.match(mini, /setIsSearchBarFloating\(false\)/);
  assert.match(mini, /setIsSearchBarFloating\(true\)/);
  assert.match(styles, /\.miniapp-shell \.miniapp-premium-topbar-floating,[\s\S]*?position: fixed/);
  assert.match(styles, /top: calc\(var\(--miniapp-top-inset, 0px\) \+ \.5rem\)/);
  assert.doesNotMatch(mini, /sticky z-30 miniapp-premium-topbar/);
  assert.match(mini, /isAiChatOpen && !isStandaloneNotesOpen \? 'is-active'/);
  assert.match(mini, /isStandaloneNotesOpen \? 'is-active'/);
  assert.match(mini, /setIsAiChatOpen\(false\); setIsStandaloneNotesOpen\(false\)/);
  assert.match(mini, /mobileSafeAreaTop=\{telegramViewport\.top\}/);
  assert.match(notes, /style=\{mode === 'mobile' \?/);
  assert.match(styles, /\.miniapp-shell \.miniapp-bottom-navigation \{\s*z-index: 260/);
  assert.match(styles, /\.miniapp-shell \.miniapp-ai-chat-backdrop-general \{\s*top: 0;/);
  assert.match(styles, /\.miniapp-shell \.miniapp-ai-chat-panel-general \.miniapp-ai-chat-header-general \{\s*position: absolute/);
  assert.match(styles, /\.miniapp-ai-chat-header-general\.miniapp-ai-chat-header-hidden/);
  assert.match(styles, /\.standalone-notes-mobile \{\s*top: 0;/);
  assert.match(styles, /background: #f5f8ff !important/);
  assert.match(styles, /background: #f8fafc !important/);
  assert.match(styles, /miniapp-bottom-navigation-item:is\(:hover, :active, :focus\)/);
  assert.match(styles, /\.standalone-notes-mobile \.standalone-notes-board \{\s*height: 100%/);
});

test('compact task cards use themed sector badges rather than left color bars and retain task actions', async () => {
  const [mini, styles] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/styles.css')
  ]);
  const list = mini.slice(mini.indexOf('{listTasks.map((task) => {'), mini.indexOf('          </div>\n          </div>\n        ) : (', mini.indexOf('{listTasks.map((task) => {')));
  assert.match(list, /miniapp-task-sector-badge/);
  assert.match(list, /taskSphere\?\.name \?\?/);
  assert.match(list, /'--miniapp-sector-color': taskSphereColor/);
  assert.doesNotMatch(list, /borderLeftWidth: '4px'|leftStripeColor|--miniapp-task-stripe/);
  assert.match(list, /onClick=\{\(\) => openTaskModal\(task\)\}/);
  assert.match(list, /onClick=\{\(\) => void completeTask\(task\.id\)\}/);
  // The lower-right subtask progress ring was deliberately removed.
  assert.doesNotMatch(list, /miniapp-subtask-progress|hasSubtasks|progressPercent/);
  assert.match(styles, /\.miniapp-shell \.miniapp-task-feed \.miniapp-task-list-card/);
  assert.match(styles, /\.miniapp-shell\.miniapp-light \.miniapp-task-feed \.miniapp-task-sector-badge/);
  assert.match(styles, /\.miniapp-shell \.miniapp-task-complete-trigger/);
});


test('white cards and no subtask-progress rings are shared by Telegram and mobile web', async () => {
  const [mini, css, entry] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/styles.css'),
    read('../../client/src/main.tsx')
  ]);
  assert.match(entry, /isMiniAppRoute\s*\?\s*<MiniApp runtime="telegram"\s*\/>/);
  assert.match(entry, /isCompactWorkspaceViewport\s*\?\s*<MiniApp runtime="web"\s*\/>/);
  const list = mini.slice(mini.indexOf('{listTasks.map((task) => {'), mini.indexOf('          </div>\n          </div>\n        ) : (', mini.indexOf('{listTasks.map((task) => {')));
  assert.doesNotMatch(list, /miniapp-subtask-progress|hasSubtasks|progressPercent/);
  assert.match(css, /body\[data-theme='light'\] \.miniapp-shell \.miniapp-task-feed \.miniapp-task-list-card,[\s\S]*?background: #ffffff !important/);
  assert.match(css, /background-image: none !important/);
});

test('desktop list cards match the premium sector-chip design without red overdue surfaces', async () => {
  const [app, css] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../../client/src/styles.css')
  ]);
  const list = app.slice(app.indexOf('{activeListTasks.map((task) => {'), app.indexOf('            </ul>', app.indexOf('{activeListTasks.map((task) => {')));
  assert.match(list, /list-task-item-premium/);
  assert.match(list, /list-task-sector-badge/);
  assert.match(list, /--desktop-list-sector-color/);
  assert.match(list, /taskSphere\?\.name \?\? 'Без сектора'/);
  assert.doesNotMatch(list, /borderLeftWidth: '4px'|borderLeftColor: sphereColor|list-task-sector-icon/);
  assert.match(list, /list-task-deadline-overdue/);
  assert.match(list, /onClick=\{\(\) => \{ if \(!isClosingTask\) openTaskWithFocusGuard\(task\)/);
  assert.match(list, /renderWorkspaceAttachmentIndicator\(task\)/);
  assert.match(css, /\.list-mode-canvas \.list-task-item-premium\.list-task-item-overdue::before/);
  assert.match(css, /\.list-mode-canvas \.list-task-item-premium\.list-task-item-overdue,[\s\S]*?background: linear-gradient/);
  assert.match(css, /body\[data-theme='light'\] \.list-mode-canvas \.list-task-item-premium\.list-task-item-overdue,[\s\S]*?background: #ffffff !important/);
  assert.match(css, /\.list-mode-canvas \.list-task-item-premium \.list-task-deadline-overdue \{[\s\S]*?color: #fb7185/);
});


test('Telegram focus task has a bounded scroll viewport without covering native controls', async () => {
  const [mini, css] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/styles.css')
  ]);
  assert.match(mini, /miniapp-telegram-task-backdrop/);
  assert.match(mini, /ref=\{openedTaskContentsScrollRef\} className="min-h-0 flex-1 overflow-y-auto/);
  const focusPanel = css.match(/\.miniapp-shell\.miniapp-telegram-fullscreen \.miniapp-telegram-task-backdrop \.miniapp-focus-task-panel \{([^}]+)\}/)?.[1] ?? '';
  assert.match(focusPanel, /height:\s*calc\(100dvh - max\(5\.8rem, var\(--miniapp-top-inset/);
  const layout = css.match(/\.miniapp-shell\.miniapp-telegram-fullscreen \.miniapp-telegram-task-backdrop \.miniapp-focus-task-scroll-layout \{([^}]+)\}/)?.[1] ?? '';
  assert.match(layout, /height:\s*100%/);
  assert.match(layout, /min-height:\s*0/);
  assert.match(css, /miniapp-focus-task-scroll-layout > \[class\*="overflow-y-auto"\] \{[\s\S]*?-webkit-overflow-scrolling:\s*touch/);
});

test('AI bottom tab opens Quick Requests and scrolls to its end even on repeated taps', async () => {
  const mini = await read('../../client/src/MiniApp.tsx');
  const nav = mini.slice(mini.indexOf('aria-label="Разделы Планировыча"'), mini.indexOf('      </nav>', mini.indexOf('aria-label="Разделы Планировыча"')));
  const tab = nav.slice(nav.indexOf('aria-current={isAiChatOpen'), nav.indexOf('<span>Чат с ИИ</span>'));
  assert.match(tab, /setActiveAiChatProjectId\(quickProject\?\.id/);
  assert.match(tab, /setActiveAiChatId\(QUICK_AI_CHAT_ID\)/);
  assert.match(tab, /setQuickAiTabNavigationSerial\(serial => serial \+ 1\)/);
  assert.match(tab, /generalAiChatNearBottomRef\.current = true/);
  assert.match(mini, /useLayoutEffect\(\(\) => \{\s*if \(!quickAiTabNavigationSerial/);
  assert.match(mini, /const alignQuickThreadToBottom = \(\) => \{[\s\S]*?thread\.scrollTop = thread\.scrollHeight/);
});


test('mobile browser timeline spacing, touch-safe navigation, and folding notes filters are isolated from Telegram', async () => {
  const [mini, css, notes] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/styles.css'),
    read('../../client/src/components/StandaloneNotesWorkspace.tsx')
  ]);
  assert.match(mini, /isWebRuntime \? 'miniapp-web-runtime' : ''/);
  assert.match(mini, /telegramMiniApp=\{isTelegramRuntime\}/);
  const timeline = css.match(/\.miniapp-shell\.miniapp-web-runtime \.miniapp-timeline-section\.miniapp-timeline-independent-blocks \{([^}]+)\}/)?.[1] ?? '';
  assert.match(timeline, /margin-top:\s*1\.15rem/);
  assert.match(timeline, /gap:\s*1\.05rem/);
  assert.match(css, /\.miniapp-shell\.miniapp-web-runtime \.miniapp-timeline-independent-blocks \.miniapp-timeline-navigation \{\s*gap:\s*1rem;/);
  const touchButton = css.match(/\.miniapp-shell\.miniapp-web-runtime button\.miniapp-bottom-navigation-item:is\(:hover, :focus, :focus-visible, :active\) \{([^}]+)\}/)?.[1] ?? '';
  assert.match(touchButton, /-webkit-tap-highlight-color:\s*transparent !important/);
  assert.match(touchButton, /background:\s*transparent !important/);
  assert.match(touchButton, /user-select:\s*none/);
  assert.match(css, /\.miniapp-shell\.miniapp-web-runtime button\.miniapp-bottom-navigation-item:focus-visible \.miniapp-bottom-navigation-icon \{\s*outline:\s*2px solid/);
  assert.match(notes, /if \(mode !== 'mobile'\) return;/);
  assert.match(notes, /standalone-notes-web-collapsible/);
  assert.match(notes, /mode === 'mobile' && !notesFiltersVisible \? 'standalone-notes-filters-collapsed'/);
  assert.match(css, /\.standalone-notes-mobile\.standalone-notes-web-collapsible \.standalone-notes-board-filters\.standalone-notes-filters-collapsed \{\s*display:\s*none;/);
  assert.match(css, /\.standalone-notes-telegram \.standalone-notes-board-filters\.standalone-notes-filters-collapsed/);
});
