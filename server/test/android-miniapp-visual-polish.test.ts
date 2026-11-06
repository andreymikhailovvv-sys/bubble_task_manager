import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('Android list keeps existing task cards and matches the Mini App light-theme polish', async () => {
  const workspace = await read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/ModernWorkspace.kt');
  assert.match(workspace, /Color\(0xFFF3F8FF\).*Color\(0xFFEEF6FF\).*Color\(0xFFF5F9FF\)/s);
  assert.match(workspace, /val searchShape=RoundedCornerShape\(21\.dp\)/);
  assert.match(workspace, /shape=searchShape,color=colors\.card,[\s\S]*?shadowElevation=0\.dp/);
  assert.match(workspace, /Text\("Привычки",fontSize=18\.sp/);
  assert.match(workspace, /Color\(0xFFE7F6EF\)/);
  assert.match(workspace, /PathEffect\.dashPathEffect/);
  const card = workspace.slice(workspace.indexOf('private fun ModernTaskCard('),
    workspace.indexOf('private fun TaskCompletionConfetti('));
  assert.match(card, /Column\(verticalArrangement=Arrangement\.spacedBy\(3\.dp\)\)/);
  assert.match(card, /\.padding\(15\.dp\)\.padding\(end=31\.dp\)/);
  assert.match(card, /Text\(task\.title,color=colors\.text/);
});

test('Android timeline has flush segmented tabs and compact date typography', async () => {
  const timeline = await read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTimeline.kt');
  const start = timeline.indexOf('internal fun NativeTimelineWorkspace(');
  const end = timeline.indexOf('private fun DayTimelineCard(', start);
  const controls = timeline.slice(start, end);
  assert.match(controls, /val switchShape=RoundedCornerShape\(21\.dp\)/);
  assert.match(controls, /val tabShape=RoundedCornerShape\(17\.dp\)/);
  assert.match(controls, /val dateShape=RoundedCornerShape\(18\.dp\)/);
  assert.match(controls, /PlatformTextStyle\(includeFontPadding=false\)/);
  assert.match(controls, /Arrangement\.spacedBy\(14\.dp\)/);
  assert.doesNotMatch(controls, /\.shadow\(if\(dark\)3\.dp else 4\.dp/);
});

test('Quick AI composer has more breathing room, soft elevation and an outlined send icon', async () => {
  const [general, voice] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeGeneralAiChat.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/AiChatVoiceInput.kt')
  ]);
  assert.match(general, /Color\(0xFFF2F7FF\).*Color\(0xFFF0F4FF\).*Color\(0xFFEDF5FF\)/s);
  assert.match(general, /composerHeightPx\.toDp\(\)\+28\.dp/);
  assert.match(general, /shadow\(elevation=3\.dp,shape=CircleShape/);
  assert.match(general, /Color\(0xFFB58BEF\),Color\(0xFFA477E8\)/);
  assert.match(general, /MiniAppAiSendIcon\(Color\.White\)/);
  assert.match(voice, /internal fun MiniAppAiSendIcon\(tint:Color\)/);
  assert.match(voice, /Modifier\.size\(44\.dp\)\.clip\(CircleShape\)/);
});
