import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('Android Timeline opens directly under the top bar, without a redundant Filters card', async () => {
  const android = await read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/ModernWorkspace.kt');
  const list = android.indexOf('LazyColumn(');
  const toolbar = android.indexOf('WorkspaceToolbar(colors, dark, mode=contentMode', list);
  const display = android.indexOf('NativeTimelineWorkspace(rootTasks', toolbar);
  assert.ok(list > 0 && toolbar > list && display > toolbar, 'workspace and timeline remain wired');
  const section = android.slice(list, display);
  assert.match(section, /if \(contentMode == WorkspaceMode\.LIST\) item \{\s*WorkspaceToolbar/);
  assert.match(section, /else item \{\s*NativeTimelineWorkspace/);
  assert.match(android, /WorkspaceTopbar\(state,colors,mode=contentMode/);
});

test('Day and Week share neutral cards without colored left-edge stripes', async () => {
  const [android, mini] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTimeline.kt'),
    read('../../client/src/components/MiniTimelineWeek.tsx')
  ]);
  const dayStart = android.indexOf('private fun DayTimelineCard(');
  const dayEnd = android.indexOf('private fun TimelineDay(', dayStart);
  const dayCard = android.slice(dayStart, dayEnd);
  assert.ok(dayStart > 0 && dayEnd > dayStart);
  assert.doesNotMatch(dayCard, /val stripe=|size=Size\(3\.5\.dp\.toPx\(\),size\.height\)/);
  assert.match(dayCard, /Modifier\.border\(1\.dp,outline,shape\)/);
  assert.match(dayCard, /Box\(\s*Modifier\.padding\(start=15\.dp,top=20\.dp\)/);
  const weekStart = android.indexOf('private fun ReadableWeekGrid(');
  const weekEnd = android.indexOf('/** Month day:', weekStart);
  const week = android.slice(weekStart, weekEnd);
  assert.match(week, /private fun ReadableWeekColumn/);
  assert.match(week, /DayTimelineCard\(entry,colors,dark,onOpen,onHabit,\{openDay\(day\)\}\)/);
  assert.doesNotMatch(week, /MiniAppCalendarEntry\(/);
  assert.match(week, /LazyRow\(/);
  assert.match(week, /rememberLazyListState\(\)/);
  assert.match(week, /columnWidth=minOf\(228\.dp,maxWidth-12\.dp\)/);
  assert.match(week, /weekScroll\.animateScrollToItem\(index\)/);
  assert.match(mini, /miniapp-native-day-card/);
});

test('Month matches Mini App: 42 compact cells with three entries and date navigation', async () => {
  const [android, mini] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTimeline.kt'),
    read('../../client/src/MiniApp.tsx')
  ]);
  const gridStart=android.indexOf('private fun MiniAppCalendarGrid(');
  const monthStart=android.indexOf('private fun CalendarDayCell(');
  const end=android.indexOf('private fun MiniAppCalendarEntry(',monthStart);
  const grid=android.slice(gridStart,monthStart);
  const month=android.slice(monthStart,end);
  assert.match(grid, /timelineEntriesForDays\(gridStart,if\(monthMode\)42 else 7/);
  assert.match(grid, /repeat\(6\)\{row->/);
  assert.match(grid, /repeat\(7\)\{col->/);
  assert.doesNotMatch(grid, /height\(IntrinsicSize\.Max\)/);
  assert.match(month, /height\(106\.dp\)/);
  assert.match(month, /entries\.take\(3\)/);
  assert.match(month, /if\(entries\.size>3\)/);
  assert.match(month, /onClick=onDay/);
  assert.match(mini, /miniapp-calendar-grid-month/);
  assert.match(mini, /const visibleEntries = entries\.slice\(0, 3\)/);
});

test('Calendar indexing avoids a full task-list scan for each day and skips month habits', async () => {
  const android=await read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTimeline.kt');
  const begin=android.indexOf('private fun timelineEntriesForDays(');
  const end=android.indexOf('private fun shortTime(',begin);
  const helper=android.slice(begin,end);
  assert.match(helper, /tasksByDay=tasks\.mapNotNull/);
  assert.match(helper, /\.groupBy\(\{it\.first\},\{it\.second\}\)/);
  assert.match(helper, /timelineEntries\(date,tasksByDay\[date\]\.orEmpty\(\)/);
  assert.match(android, /if\(monthMode\)emptyList\(\) else habits/);
});
