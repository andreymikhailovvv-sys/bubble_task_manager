import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

test('king gathers the same visible coins in the web and Android mascots', () => {
  const web = read('../../client/src/components/EconomicMoneyGesture.tsx');
  const native = read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeMascotMotion.kt');
  const webKing = web.slice(web.indexOf('if(king&&income){'), web.indexOf('if(income){', web.indexOf('if(king&&income){')));
  const nativeKing = native.slice(native.indexOf('king&&income -> (0..17)'), native.indexOf('income -> (0..5)', native.indexOf('king&&income -> (0..17)')));
  for (const scene of [webKing, nativeKing]) {
    assert.match(scene, /pileX=215/);
    assert.match(scene, /pileY=268/);
    assert.match(scene, /lapX=215/);
    assert.match(scene, /gathered=/);
    assert.doesNotMatch(scene, /pickUp|if\(t<\.16/);
  }
  assert.match(webKing, /node\.setAttribute\('opacity',String\(1-ease/);
  assert.match(native, /skin=="king" && mode=="income" -> 24/);
});

test('opening a task from the context menu requests a pane rather than replacing one', () => {
  const source = read('../../client/src/App.tsx');
  const start = source.indexOf('const openTaskInOtherPane =');
  assert.ok(start >= 0);
  const handler = source.slice(start, source.indexOf('const sphereById =', start));
  assert.match(handler, /setPendingWorkspaceBlock\(\{ kind: 'task-ai', taskId: task\.id \}\)/);
  assert.doesNotMatch(handler, /replaceFullscreenPanel|setFocusedTaskId|setFullscreenPanelSlots/);
});

test('operation totals are grouped left, and a single notes block has rounded edges', () => {
  const economic = read('../../client/src/EconomicApp.css');
  const css = read('../../client/src/styles.css');
  const notesEditor = read('../../client/src/components/NotesEditor.tsx');
  assert.match(economic, /\.econ-operations-toolbar \.econ-filter-totals\{flex:0 1 auto/);
  assert.match(economic, /justify-content:flex-start/);
  assert.match(css, /\.fullscreen-workspace-single:has\(\.standalone-notes-inline-mount\)/);
  assert.match(css, /\.fullscreen-workspace-single-content \.standalone-notes-inline \.standalone-notes-board\s*\{\s*border-radius: 18px !important/);
  assert.match(css, /scrollbar-gutter: auto !important/);
  assert.match(notesEditor, /useScrollFade\(editorRef\)/);
});
