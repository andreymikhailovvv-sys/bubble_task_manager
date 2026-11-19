import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('desktop bubble SVG does not rerender for unrelated focused editor keystrokes', () => {
  const app = load('../../client/src/App.tsx');
  const bubbles = load('../../client/src/components/BubbleField.tsx');
  const hook = load('../../client/src/hooks/useStableCallbackMap.ts');

  assert.match(bubbles, /export const BubbleField = memo\(function BubbleField\(/);
  assert.match(app, /const bubbleCallbacks = useStableCallbackMap\(/);
  assert.match(app, /onSelect=\{bubbleCallbacks\.onSelect\}/);
  assert.match(app, /onBubbleAction=\{bubbleCallbacks\.onBubbleAction\}/);
  assert.match(app, /onQuickCompleteTask=\{bubbleCallbacks\.onQuickCompleteTask\}/);
  assert.match(app, /onUpdateSubtaskDueDate=\{bubbleCallbacks\.onUpdateSubtaskDueDate\}/);
  assert.match(app, /onOpenInOtherPane=\{bubbleCallbacks\.onOpenInOtherPane\}/);

  // Current callbacks must be visible after React commits, including when the
  // selected task changes. Stable identities must not freeze old task closures.
  assert.match(hook, /useLayoutEffect\(\(\) => \{\s*latest\.current = callbacks/);
  assert.match(hook, /latest\.current\[name\]\(\.\.\.args\)/);
  assert.match(hook, /useMemo\(\(\) => Object\.fromEntries\(/);
});

test('bubble filters and task notification badges still invalidate memo on real changes', () => {
  const app = load('../../client/src/App.tsx');
  assert.match(app, /hasUnreadAiMessage = useCallback\(/);
  assert.match(app, /\[aiDialogByTask, aiReadCursorByTask\]\)/);
  assert.match(app, /hasAiNotification=\{hasUnreadAiMessage\}/);
  assert.match(app, /tasks=\{isBubbleFullscreen \? fullscreenBubbleTasks : visibleTasks\}/);
  assert.match(app, /subtaskMap=\{displayedSubtaskMap\}/);
  assert.match(app, /poppingTaskId=\{poppingTaskId\}/);
  assert.match(app, /mode=\{mode\}/);
  assert.match(app, /selectedId=\{editorState\?\.task\?\.id\}/);
});
