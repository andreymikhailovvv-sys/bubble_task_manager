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

test('Mini App and native Android display other-day habits after the today group', async () => {
  const mini = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  const android = await readFile(new URL('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/ModernWorkspace.kt', import.meta.url), 'utf8');
  assert.ok(mini.includes('return habits.filter((habit) => !habit.isAutoCompleted && !habit.isArchived).sort'));
  assert.ok(mini.includes('miniapp-habit-days-divider'));
  assert.ok(mini.includes('miniapp-habit-day-badge'));
  assert.ok(android.includes('state.habits.filter { !it.isAutoCompleted && !it.isArchived }'));
  assert.ok(android.includes('otherHabits = habits.filterNot { habitScheduledToday(it, today) }'));
  assert.ok(android.includes('workspaceHabitNextDay'));
  assert.ok(android.includes('WorkspaceHabitBubble'));
});

test('day timeline cards have no colored left-edge stripes in light or dark Mini App', async () => {
  const styles = await readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8');
  assert.ok(styles.includes('.miniapp-native-day-card {'), 'preserve day card styling');
  assert.ok(styles.includes('.miniapp-native-day-card-dot {'), 'preserve colored dots within cards');
  assert.ok(styles.includes('.miniapp-native-day-rail::before {'), 'preserve timeline rail next to hour labels');
  assert.doesNotMatch(styles, /\.miniapp-native-day-card::before\s*\{/, 'no left-edge stripe on day cards');
  assert.doesNotMatch(styles, /\.miniapp-shell:not\(\.miniapp-light\) \.miniapp-native-day-card::before\s*\{/, 'no dark-theme stripe overrides');
});


test('Mini App week matches Android readable columns with seven date selectors and day cards', async () => {
  const [mini, styles, week, android, entry] = await Promise.all([
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/MiniTimelineWeek.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTimeline.kt', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/main.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(android, /private fun ReadableWeekGrid\(/);
  assert.match(mini, /timelineView === 'week' \? \(\s*<MiniTimelineWeek/);
  assert.match(mini, /onSelectDay=\{setTimelineAnchorDate\}/);
  assert.match(mini, /onOpenDay=\{openDayTimeline\}/);
  assert.match(mini, /key=\{timelineCalendar\.days\[0\]\?\.dateKey\}/);
  assert.match(week, /miniapp-native-week-day-picker/);
  assert.match(week, /days\.map\(\(\{ date, dateKey \}, index\)/);
  assert.match(week, /onClick=\{\(\) => scrollToDay\(index\)\}/);
  assert.match(week, /track\.scrollTo\(\{/);
  assert.match(week, /onScroll=\{syncSelectedDayOnScroll\}/);
  assert.match(week, /aria-pressed=\{isSelected\}/);
  assert.match(week, /miniapp-native-week-column/);
  assert.match(week, /onClick=\{\(\) => onOpenDay\(date\)\}/);
  assert.match(week, /miniapp-native-day-card miniapp-native-day-habit/);
  assert.match(week, /'miniapp-native-day-card'/);
  assert.match(week, /isSubtask \? ' miniapp-native-day-subtask'/);
  assert.match(week, /isEvent \? ' miniapp-native-day-event'/);
  assert.match(week, /isReminder\) onOpenDay\(date\)/);
  assert.match(styles, /miniapp-native-week-track \{[\s\S]*?overflow-x: auto;/);
  assert.match(styles, /miniapp-native-week-track::after \{/);
  assert.match(styles, /miniapp-native-week-day-button\.is-selected span/);
  assert.match(styles, /touch-action: auto; \/\* The old pan-y declaration blocked horizontal touch scrolling/);
  assert.match(styles, /\.miniapp-shell:not\(\.miniapp-light\) \.miniapp-native-week-column/);
  assert.match(entry, /<MiniApp runtime="telegram"/);
  assert.match(entry, /<MiniApp runtime="web"/);
});
