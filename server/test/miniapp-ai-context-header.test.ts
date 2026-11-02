import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('miniapp general AI chat has unified header with custom project, chat and model pickers', async () => {
  const [mini, header, css] = await Promise.all([
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/MiniGeneralAiChatHeader.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);
  const general = mini.slice(mini.indexOf('miniapp-ai-chat-backdrop-general'), mini.indexOf('miniapp-ai-chat-thread-wrap relative min-h-0 flex-1', mini.indexOf('miniapp-ai-chat-backdrop-general')));
  assert.match(general, /<MiniGeneralAiChatHeader/);
  assert.match(general, /model=\{generalAiChatModel\}/);
  assert.match(general, /onSelectModel=\{\(nextModel\) => \{ changeGeneralAiChatModel\(nextModel\)/);
  assert.match(general, /onSelectProject=\{\(project\) =>/);
  assert.match(general, /onSelectChat=\{\(chatId\) =>/);
  assert.doesNotMatch(general, /<select/); // Android native dropdown is gone from this header
  assert.match(header, /toggle\('projects'\)/);
  assert.match(header, /toggle\('chats'\)/);
  assert.match(header, /toggle\('models'\)/);
  assert.match(header, /role="dialog" aria-modal="true"/);
  assert.match(header, /onCreateProject/);
  assert.match(header, /onCreateChat/);
  assert.match(css, /miniapp-ai-context-header\.miniapp-ai-chat-header-hidden/);
  assert.match(css, /miniapp-ai-context-picker-layer/);
  assert.match(css, /miniapp-light \.miniapp-ai-context-picker/);
});

test('miniapp AI chat remains scroll-to-top with untouched message and composer plumbing', async () => {
  const mini = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8');
  assert.match(mini, /updateAiChatHeaderVisibility\(container\.scrollTop, generalAiChatScrollTopRef, setIsGeneralAiChatHeaderHidden\)/);
  assert.match(mini, /generalAiChatNearBottomRef\.current/);
  assert.match(mini, /<MiniAiChatComposer/);
  assert.match(mini, /<AiReadAloudAction/);
  assert.match(css, /padding-top: calc\(var\(--miniapp-top-inset, 0px\) \+ var\(--miniapp-ai-header-height\) \+ \.8rem\) !important/);
  assert.match(css, /transform: translateY\(-100%\)/);
});
