import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('monitoring task navigation is inside the Quick AI message bubble', async () => {
  const [general, shared] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeGeneralAiChat.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTaskAiChat.kt')
  ]);
  assert.match(general, /onOpenMonitoredTaskAi=if\(thread\?\.id==QUICK_AI_THREAD_ID\)/);
  assert.doesNotMatch(general, /message\.monitoringTaskId\?\.takeIf/);
  const begin = shared.indexOf('internal fun TaskChatBubble(');
  const end = shared.indexOf('private fun Color.isDarkColor()', begin);
  const bubble = shared.slice(begin, end);
  assert.match(bubble, /message\.monitoringTaskId\?\.takeIf/);
  assert.match(bubble, /Text\("Ответить в чате задачи"/);
  assert.match(bubble, /onOpenMonitoredTaskAi\?\.invoke\(monitoredTaskId\)/);
});

test('AI file previews are shared between Quick AI and task AI', async () => {
  const [general, task, tiles] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeGeneralAiChat.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTaskAiChat.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeAiAttachmentTiles.kt')
  ]);
  assert.match(general, /NativeAiAttachmentTiles\(files\.toList\(\),c\)/);
  assert.match(task, /NativeAiAttachmentTiles\(files\.toList\(\),c\)/);
  assert.match(task, /NativeAiMessageAttachmentTiles\(attachmentNames,c\)/);
  assert.match(tiles, /withContext\(Dispatchers\.Default\)\{thumbnail\(bytes\)\}/);
  assert.match(tiles, /AiNativeFileKind\.WORD/);
  assert.match(tiles, /AiNativeFileKind\.EXCEL/);
});

test('push delivery can display while session refresh is doing network I/O', async () => {
  const [delivery, activity] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/notifications/AndroidNotificationDelivery.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/MainActivity.kt')
  ]);
  assert.match(delivery, /private val deliveryMutex=Mutex\(\)/);
  const begin=delivery.indexOf('suspend fun deliverPush(');
  const end=delivery.indexOf('private fun publish(',begin);
  assert.match(delivery.slice(begin,end), /deliveryMutex\.withLock/);
  assert.doesNotMatch(delivery.slice(begin,end), /mutex\.withLock/);
  assert.match(activity, /delay\(30_000L\)/);
});

test('list completion animates out with confetti before changing server status', async () => {
  const source=await read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/ModernWorkspace.kt');
  assert.match(source, /AnimatedVisibility\(visible=!completing/);
  assert.match(source, /TaskCompletionConfetti\(\)/);
  assert.match(source, /delay\(460\)[\s\S]*?vm\.changeStatus\(task\.id,TaskStatus\.DONE\)/);
});
