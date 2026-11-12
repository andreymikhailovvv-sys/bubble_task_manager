import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('all chat surfaces mark completed task and subtask navigation chips as muted with crossed out labels', async () => {
  const [web, mini, css, nativeRich, nativeChat, nativeGeneral, nativeHome] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/styles.css'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTaskAiRichText.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTaskAiChat.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeGeneralAiChat.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeScreen.kt')
  ]);
  for (const component of [web, mini]) {
    assert.match(component, /const completed = matchedTask\?\.status === 'DONE'/);
    assert.match(component, /completed \? 'ai-task-ref-chip--completed'/);
    assert.match(component, /ai-task-ref-chip__title/);
    assert.match(component, /task\.status === 'DONE'\) \? 'ai-task-ref-chip--completed'/);
  }
  assert.match(css, /\.ai-task-ref-chip--completed \{[\s\S]*?opacity: 0\.62/);
  assert.match(css, /\.ai-task-ref-chip--completed \.ai-task-ref-chip__title \{[\s\S]*?text-decoration: line-through/);
  assert.match(nativeGeneral, /tasks\.filter\{it\.status==TaskStatus\.DONE\}/);
  assert.match(nativeGeneral, /completedTaskIds=completedTaskIds/);
  assert.match(nativeChat, /home\.tasks\.filter\{it\.status==TaskStatus\.DONE\}/);
  assert.match(nativeChat, /taskTitles=taskTitles,completedTaskIds=completedTaskIds/);
  assert.match(nativeChat, /onOpenTaskReference=onOpenTaskReference/);
  assert.match(nativeHome, /onOpenTaskReference=\{referenceId->/);
  assert.match(nativeRich, /val completed=ref\.id in completedTaskIds/);
  assert.match(nativeRich, /\.alpha\(if\(completed\)\.62f else 1f\)/);
  assert.match(nativeRich, /if\(completed\)TextDecoration\.LineThrough/);
  assert.match(nativeRich, /\.clickable\(enabled=title!=null\)/);
});

test('participant messages and comment cards keep author tints without a left accent stripe', async () => {
  const [css, mini, web, mascot] = await Promise.all([
    read('../../client/src/styles.css'),
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/App.tsx'),
    read('../../client/src/components/PlanikMascot.tsx')
  ]);
  const rules = ['collaboration-comment-card', 'miniapp-comment-card'];
  for (const name of rules) {
    const body = css.match(new RegExp('\\.' + name + ' \\{([\\s\\S]*?)\\}'));
    assert.ok(body, 'missing ' + name);
    assert.doesNotMatch(body[1], /border-left/);
    assert.match(body[1], /var\(--comment-author-color\)/);
  }
  const authored = css.match(/\.miniapp-shell \.miniapp-ai-chat-message-user\.miniapp-ai-chat-message-authored \{([^}]+)\}/);
  assert.ok(authored);
  assert.doesNotMatch(authored[1], /border-left/);
  assert.match(authored[1], /color-mix\(in srgb, var\(--message-author-color\) 34%/);
  assert.match(css, /\.miniapp-shell:not\(\.miniapp-light\) \.miniapp-ai-chat-message-user\.miniapp-ai-chat-message-authored/);
  const lightAuthored = css.match(/body\[data-theme='light'\] \.miniapp-shell \.miniapp-ai-chat-message-user\.miniapp-ai-chat-message-authored \{([^}]+)\}/);
  assert.ok(lightAuthored);
  assert.doesNotMatch(lightAuthored[1], /border-left/);
  assert.match(mini, /miniapp-ai-chat-message-authored/);
  assert.match(mini, /miniapp-comment-card rounded-2xl border/);
  assert.match(web, /collaboration-chat-message-authored/);
  // Mascot still has its tiny alternating reach animation, but hands no longer follow x/y.
  assert.doesNotMatch(mascot, /leftHand\.current|rightHand\.current|ref=\{leftHand\}|ref=\{rightHand\}/);
  assert.match(mascot, /planik-hover-left/);
});
