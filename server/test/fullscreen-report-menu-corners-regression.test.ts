import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('last-subtask confirmation offers the same completion report as ordinary task completion', async () => {
  const app = await read('../../client/src/App.tsx');
  assert.match(app, /const maybeOfferTaskCompletionReport = \(task: Task\) =>/);
  assert.match(app, /maybeOfferTaskCompletionReport\(task\);/);
  const confirmation = app.slice(app.indexOf("const shouldCloseParent = window.confirm("), app.indexOf('  const handleSubtaskCommentContextMenu'));
  assert.match(confirmation, /await api\.updateTask\(subtask\.parentTaskId, \{ status: 'DONE' \}\)/);
  assert.match(confirmation, /if \(completedParent\) maybeOfferTaskCompletionReport\(completedParent\);/);
  assert.match(app, /currentUser\?\.offerTaskCompletionReport !== false/);
});

test('postpone submenu closes on exiting the popup while remaining reachable without a pointer gap', async () => {
  const [app, bubbles, css] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../../client/src/components/BubbleField.tsx'),
    read('../../client/src/styles.css')
  ]);
  assert.match(bubbles, /onMouseLeave=\{\(\) => setContextPostponeSubmenuOpen\(false\)\}/);
  assert.match(app, /onMouseLeave=\{\(\) => setListTaskPostponeSubmenuOpen\(false\)\}/);
  assert.match(bubbles, /left-full top-\[46px\] ml-0 w-56/);
  assert.match(app, /\{listTaskPostponeSubmenuOpen \? \([\s\S]*?left-full top-\[46px\] ml-0/);
  assert.match(css, /\.fullscreen-task-context-menu > \.surface-popover > button \{/);
});

test('embedded Focus monitoring control switches to the letter A only inside a narrow assistant pane', async () => {
  const [component, css, app] = await Promise.all([
    read('../../client/src/components/TaskMonitoringStatuses.tsx'),
    read('../../client/src/styles.css'),
    read('../../client/src/App.tsx')
  ]);
  assert.match(component, /task-monitor-button-full-label/);
  assert.match(component, /task-monitor-button-compact-label/);
  assert.match(component, /aria-hidden="true">А<\/span>/);
  assert.match(css, /container-name: focus-assistant;/);
  assert.match(css, /@container focus-assistant \(max-width: 290px\)/);
  assert.match(app, /focused-task-ai-toolbar-title/);
});

test('workbench corner clipping delegates a single outline to each parent pane', async () => {
  const css = await read('../../client/src/styles.css');
  assert.match(css, /\.fullscreen-workspace-pane \.focused-task-modal-backdrop\.fullscreen-task-embedded \{[\s\S]*?padding: 0 !important/);
  assert.match(css, /\.fullscreen-workspace-pane \.fullscreen-task-embedded :is\(\.focused-task-editor-shell, \.focused-task-ai-panel\)/);
  assert.match(css, /\.fullscreen-workspace-pane \.ai-chat-expanded-embedded > \.ai-chat-expanded/);
  assert.match(css, /\.fullscreen-workspace-pane \.standalone-notes-inline \.standalone-notes-board/);
  assert.match(css, /border-radius: 0 !important;/);
});

test('embedded general AI thread scrolls within its pane and reserves composer height plus action space', async () => {
  const [css, chat] = await Promise.all([
    read('../../client/src/styles.css'),
    read('../../client/src/components/ExpandedAiChat.tsx')
  ]);
  assert.match(css, /\.ai-chat-expanded-embedded \.ai-chat-expanded-main \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;/);
  assert.match(css, /\.ai-chat-expanded-embedded \.ai-chat-expanded-thread \{\s*height: auto;\s*min-height: 0;\s*flex: 1 1 0;/);
  assert.match(css, /\.ai-chat-expanded-embedded \.ai-chat-expanded-bottom-spacer \{[\s\S]*?height: calc\(var\(--ai-composer-height, 76px\) \+ 3\.5rem\);/);
  assert.match(chat, /ResizeObserver\(update\)/);
  assert.match(chat, /root\.style\.setProperty\('--ai-composer-height',/);
  assert.match(chat, /\{messages\}\{status\}/);
  assert.match(chat, /ai-chat-expanded-bottom-spacer/);
  assert.match(chat, /onScroll=\{handleScroll\} className="ai-chat-expanded-thread"/);
});

test('bubbles and List share the Timeline-sized task menu, but Timeline keeps its own layout', async () => {
  const [css, app, bubbles] = await Promise.all([
    read('../../client/src/styles.css'),
    read('../../client/src/App.tsx'),
    read('../../client/src/components/BubbleField.tsx')
  ]);
  assert.match(css, /\.fullscreen-task-context-menu > \.surface-popover \{[\s\S]*?width: 226px;/);
  assert.match(css, /\.fullscreen-task-context-menu > \.surface-popover > button \{[\s\S]*?min-height: 36px;[\s\S]*?padding: 8px 12px !important;/);
  assert.match(bubbles, /className=\{fullscreen \? 'fixed z-\[130\] fullscreen-task-context-menu'/);
  assert.match(bubbles, /CONTEXT_MENU_WITH_SUBMENU_WIDTH = 450;/);
  assert.match(bubbles, /CONTEXT_MENU_HEIGHT = 232;/);
  assert.match(app, /getViewportSafeContextMenuPosition\(event\.clientX, event\.clientY, \{ submenu: true, height: isBubbleFullscreen \? 232 : 188, width: isBubbleFullscreen \? 450 : undefined \}\), taskId: task\.id/);
  assert.match(app, /className=\{isBubbleFullscreen \? 'fixed z-\[130\] fullscreen-task-context-menu' : 'fixed z-\[130\]'\}/);
  // Do not tighten Timeline's existing menu.
  assert.match(app, /className="surface-popover relative min-w-44 rounded-xl border p-2 shadow-2xl"/);
});
