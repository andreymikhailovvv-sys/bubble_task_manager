import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('mini app task and subtask focus open above the general AI chat', async () => {
  const source = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes("isAiChatOpen ? 'z-[120]' : 'z-[90]'"));
  assert.ok(source.includes("isAiChatOpen ? 'z-[120]' : 'z-[100]'"));
  assert.ok(source.includes('onOpenTask={openAiTaskReference}'));
  assert.ok(source.includes("isAiChatOpen ? 'z-[130]' : 'z-[110]'"));
});

test('desktop task AI shows buttons and opens targets in four views', async () => {
  const source = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  assert.ok(source.split('showTaskReferenceButtons /> : <CollapsibleUserMessage>').length >= 5);
  assert.ok(source.includes('setIsFocusAiExpanded(false); openTaskReferenceFromAi(task);'));
  assert.ok(source.includes('setIsAiExpanded(false); openTaskReferenceFromAi(task);'));
});

test('desktop task references open above expanded general chat and notification buttons fit their labels', async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);
  assert.ok(source.includes("isAiChatOpen ? 'z-[180]' : isFocusModeOpen ? 'z-[150]' : 'z-40'"));
  assert.match(styles, /\.system-notification-task-button\s*\{[^}]*width:\s*auto;/s);
  assert.doesNotMatch(styles, /\.system-notification-task-button\s*\{[^}]*width:\s*12\.5rem;/s);
});

test('quick desktop and mini general chat default to Luna, other web chats keep Mini', async () => {
  const [app, mini] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8')
  ]);
  assert.ok(app.includes("quickAiChatModel, setQuickAiChatModel] = useState<AiChatModel>('gpt-6-luna')"));
  assert.ok(app.includes("selectedAiChatModel, setSelectedAiChatModel] = useState<AiChatModel>('gpt-5.4-mini')"));
  assert.ok(app.includes("activeAiChat?.id === QUICK_AI_CHAT_ID ? quickAiChatModel : selectedAiChatModel"));
  assert.ok(mini.includes("selectedAiChatModel, setSelectedAiChatModel] = useState<AiChatModel>('gpt-6-luna')"));
});

test('general chat chooses task or event for reminders; task chat keeps subtasks', async () => {
  const source = await readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('operation=create_task'));
  assert.ok(source.includes('operation=create_event'));
  assert.ok(source.includes('пользователь должен что-то сделать'));
  assert.ok(source.includes('notifyBeforeMinutes=0'));
  assert.ok(source.includes('создай подзадачу этой задачи через create_subtask'));
  assert.ok(source.includes('dueDate в локальном времени пользователя'));
});
