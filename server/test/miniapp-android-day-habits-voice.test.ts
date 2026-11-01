import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('day timeline defaults to Android compact groups when navigating to Timeline tab', async () => {
  const mini = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8');
  assert.ok(mini.includes("useState<TimelineView>('day')"));
  assert.ok(mini.includes("setDisplayMode('timeline'); setTimelineView('day'); setTimelineAnchorDate(new Date());"));
  assert.ok(mini.includes('className="miniapp-native-day-rail"'));
  assert.ok(mini.includes('nativeDayGroups.map(({ hour, entries }) =>'));
  assert.ok(styles.includes('.miniapp-native-day-rail::before'));
  assert.ok(styles.includes('.miniapp-native-day-card'));
});

test('Mini App and mobile web mic start transcription without opening live mode menu', async () => {
  const [voice, composer] = await Promise.all([
    readFile(new URL('../../client/src/components/VoiceInputButton.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/MiniAiChatComposer.tsx', import.meta.url), 'utf8')
  ]);
  assert.ok(composer.includes('activationMode="transcription"'));
  assert.ok(voice.includes("if (activationMode === 'transcription') void start();"));
  assert.ok(voice.includes('const startLive = () => {'), 'live voice must remain available for later UI placement');
});

test('Mini App habit list displays only entries scheduled for today', async () => {
  const mini = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  const android = await readFile(new URL('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/ModernWorkspace.kt', import.meta.url), 'utf8');
  assert.ok(mini.includes('return habits.filter((habit) => isHabitScheduledForDate(habit, new Date())).sort'));
  assert.ok(android.includes('state.habits.filter { habitScheduledToday(it, todayForHabits) }'));
});
