import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const read=(path:string)=>readFile(new URL(path,import.meta.url),'utf8');

test('personal and Work both mount the exact same quick-chat hover container',async()=>{
  const [app,work,frame]=await Promise.all([
    read('../../client/src/App.tsx'),read('../../client/src/WorkQuickAi.tsx'),
    read('../../client/src/components/QuickAiLauncherFrame.tsx')
  ]);
  assert.match(app,/<QuickAiLauncherFrame/);
  assert.match(work,/<QuickAiLauncherFrame work/);
  assert.match(frame,/ai-chat-launcher group fixed/);
  assert.match(frame,/onMouseEnter/);
  assert.match(frame,/onMouseLeave/);
  assert.match(work,/group-hover:pointer-events-auto/);
  assert.match(work,/bottom-14 right-0 w-80/);
  assert.match(work,/AutoGrowingTextarea/);
  assert.match(work,/ai-chat-launcher-button/);
});

test('corporate expanded AI is personal ExpandedAiChat, with Work API adapter',async()=>{
  const [component,shared]=await Promise.all([
    read('../../client/src/WorkQuickAi.tsx'),
    read('../../client/src/components/ExpandedAiChat.tsx')
  ]);
  assert.match(component,/<ExpandedAiChat/);
  assert.match(component,/workQuickAiAsk/);
  assert.match(component,/workAiAsk/);
  assert.match(component,/readOnlyStructure/);
  assert.match(component,/attachmentsEnabled=\{false\}/);
  assert.match(shared,/ai-chat-expanded-backdrop/);
  assert.match(shared,/readOnlyStructure=false/);
  assert.match(shared,/attachmentsEnabled=true/);
});

test('corporate Focus uses same extracted window frame, model chip and composer as personal Focus',async()=>{
  const [app,work,frame,ai,chip]=await Promise.all([
    read('../../client/src/App.tsx'),
    read('../../client/src/WorkTaskFocusDialog.tsx'),
    read('../../client/src/components/FocusedTaskWindowFrame.tsx'),
    read('../../client/src/WorkAiPanel.tsx'),
    read('../../client/src/components/AiModelChip.tsx')
  ]);
  assert.match(app,/<FocusedTaskWindowFrame/);
  assert.match(work,/<FocusedTaskWindowFrame/);
  assert.match(frame,/focused-task-modal-backdrop/);
  assert.match(frame,/focused-task-modal-layout/);
  assert.match(work,/focused-task-editor-shell focus-mode-shell/);
  assert.match(work,/focused-task-ai-panel focused-task-modal-panel-height/);
  assert.match(work,/DateTimePickerWithApply/);
  assert.match(work,/TaskMonitoringBadge/);
  assert.match(work,/personalFocus/);
  assert.match(ai,/AiModelChip/);
  assert.match(ai,/TaskAiEmptyState/);
  assert.match(ai,/AutoGrowingTextarea/);
  assert.match(chip,/ai-chat-model-cap/);
  assert.doesNotMatch(work,/api\.updateTask\(/);
});
