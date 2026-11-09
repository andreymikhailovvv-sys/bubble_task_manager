import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (file: string) =>
  readFile(new URL(file, import.meta.url), 'utf8');

test('capability catalog distinguishes task and general AI chats and links integrations', async () => {
  const welcome = await read('../../client/src/components/AiChatWelcome.tsx');
  const task = welcome.slice(welcome.indexOf('const taskGroups:'), welcome.indexOf('const generalGroups:'));
  const general = welcome.slice(welcome.indexOf('const generalGroups:'), welcome.indexOf('type Props ='));
  assert.match(task, /Управление подзадачами/);
  assert.match(task, /Сроки выполнения/);
  assert.match(task, /Напоминания и отложенные действия/);
  assert.match(task, /Документы Word/);
  assert.match(task, /Таблицы Excel/);
  assert.match(task, /Изображения/);
  assert.match(task, /Поиск в интернете/);
  assert.match(task, /Переписки Telegram/);
  assert.match(task, /Электронная почта/);
  assert.match(general, /Оптимизация расписания/);
  assert.match(general, /Telegram-ассистент/);
  assert.match(general, /Почтовый ассистент/);
  assert.match(general, /ИИ-чекапы/);
  assert.match(general, /Уведомления о задачах/);
  assert.match(welcome, /import\('\.\/TelegramAiAssistantSettings'\)/);
  assert.match(welcome, /import\('\.\/MailAssistantSettings'\)/);
  assert.match(welcome, /onOpenCheckups\?\.\(\)/);
  assert.match(welcome, /aria-modal="true"/);
  assert.match(welcome, /data-ai-theme=\{resolvedTheme\}/);
  assert.match(welcome, /onClick=\{\(\) => setShowCapabilities\(true\)\}/);
});

test('empty chat capability modal is wired in both desktop and mini app chat views', async () => {
  const [app, mini, expanded, task, styles] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/ExpandedAiChat.tsx'),
    read('../../client/src/components/TaskAiEmptyState.tsx'),
    read('../../client/src/components/AiChatWelcome.css')
  ]);
  assert.match(task, /<AiChatWelcome kind="task" variant=\{variant\}/);
  assert.match(app, /onOpenCheckups=\{\(\) => \{\s*setIsAiChatOpen\(false\);\s*setIsSettingsOpen\(true\);/);
  assert.match(expanded, /<AiChatWelcome key=\{activeChat\?\.id\} kind="general"/);
  assert.match(mini, /<AiChatWelcome kind="general" variant="miniapp"/);
  assert.match(mini, /<TaskAiEmptyState variant="miniapp" themeMode=\{effectiveMiniTheme\} \/>/);
  assert.match(styles, /\.ai-capabilities-grid/);
  assert.match(styles, /max-width: 560px/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /box-shadow: none/);
});
