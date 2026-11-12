import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { linkVerifiedVoiceTaskMentions, speechSafeVoiceToolAnswer } from '../../client/src/lib/voice-task-links.js';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('Android Planik loads the same authenticated task, sector and habit data as the native list', async () => {
  const mini = await read('../../client/src/MiniApp.tsx');
  assert.match(mini, /const androidVoice = Boolean\(androidPlanikLaunch\)/);
  assert.match(mini, /api\.getSpheres\(\),\s*api\.getTasks\(\),\s*api\.getHabits\(\)/);
  assert.doesNotMatch(mini, /androidVoice && !androidPlanikLaunch\?\.taskId \? Promise\.resolve\(\[\] as Task\[\]\)/);
});

test('valid task-title matches get buttons and invalid model-generated IDs never become buttons', () => {
  const tasks = [
    { id: 'task-1', title: 'Подготовить договор' },
    { id: 'task-2', title: 'Позвонить клиенту' },
    { id: 'task-3', title: 'Сделать отчёт' }
  ] as never;
  const content = linkVerifiedVoiceTaskMentions(
    'Нашёл задачи:\n1. Подготовить договор\n2. Позвонить клиенту', tasks);
  assert.match(content, /Подготовить договор \[\[task_ref=task-1\]\]/);
  assert.match(content, /Позвонить клиенту \[\[task_ref=task-2\]\]/);
  assert.doesNotMatch(content, /task-3/);
  const unverified = linkVerifiedVoiceTaskMentions('Левая задача [[task_ref=fake-id]]', tasks);
  assert.doesNotMatch(unverified, /fake-id/);
  assert.match(linkVerifiedVoiceTaskMentions('Создано [[task_ref=new-id]]', tasks, true), /new-id/);
  const duplicate = linkVerifiedVoiceTaskMentions('1. Повторяющаяся задача', [
    { id: 'task-A', title: 'Повторяющаяся задача' },
    { id: 'task-B', title: 'Повторяющаяся задача' }
  ] as never);
  assert.doesNotMatch(duplicate, /task_ref/);
});

test('Realtime narration never receives a raw task_ref label or a UUID', () => {
  const spoken = speechSafeVoiceToolAnswer('Проверил договор [[task_ref=task-1]]. ID задачи: 667efb92-43a0-4f7c-b543-5fc623e444ce.');
  assert.doesNotMatch(spoken, /task_ref|task-1|667efb92/);
  assert.match(spoken, /Проверил договор/);
  const [voice, server] = await Promise.all([
    read('../../client/src/components/LiveVoiceDialog.tsx'),
    read('../src/services/ai-live-voice.service.ts')
  ]);
  assert.match(voice, /speechSafeVoiceToolAnswer\(result\.answer\)/);
  assert.match(server, /function readableVoiceContext\(text: string\)/);
  assert.match(server, /readableVoiceContext\(packet\.answer/);
  assert.match(server, /readableVoiceContext\(item\.content\)/);
  assert.match(server, /Не произноси вслух task ID/);
});

test('task tool results with verified links uncover the chat without stopping Realtime', async () => {
  const [mini, voice] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/LiveVoiceDialog.tsx')
  ]);
  assert.match(mini, /linkVerifiedVoiceTaskMentions\(event\.result\.answer, tasks/);
  assert.match(mini, /return \/\\\[\\\[task_ref/);
  assert.match(voice, /linkedTasksInChat = onLiveToolResultRef\.current\?\.\(/);
  assert.match(voice, /hasPlanikActionSurface\(result\) \|\| linkedTasksInChat/);
  assert.match(voice, /setCollapsed\(true\)/);
});

test('ten-second waiting acknowledgements are isolated, tool-free and do not discard tool results', async () => {
  const server = await read('../src/services/ai-live-voice.service.ts');
  assert.match(server, /\}, 10_000\);/);
  assert.match(server, /conversation: 'none'/);
  assert.match(server, /metadata: \{ purpose: 'planik_tool_waiting' \}/);
  assert.match(server, /tools: \[\]/);
  assert.match(server, /max_output_tokens: 90/);
  assert.match(server, /if \(waitingResponseInFlight\) resumeAfterWaiting = true/);
  assert.match(server, /stopWaitingTimer\(\)/);
});

test('Android does not clear other WebView account cookies or silently switch the task list', async () => {
  const [activity, vm] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/planik/PlanikLiveActivity.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeViewModel.kt')
  ]);
  assert.doesNotMatch(activity, /manager\.removeAllCookies\s*\{/);
  assert.match(activity, /manager\.setCookie\(origin, "\$name=; Max-Age=0; Path=\/"\)/);
  assert.match(vm, /Account changed while Realtime was open; preserving prior workspace/);
  assert.match(vm, /Сессия Android изменилась после Планика/);
});
