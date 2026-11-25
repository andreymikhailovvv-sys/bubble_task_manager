import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { habitScheduledOnLocalDay } from '../src/lib/habit-notification-schedule.js';

const fixture={
  recurrenceType:'WEEKDAYS',
  weekdays:[5],
  intervalDays:null,
  createdAt:new Date('2026-11-16T23:30:00.000Z'),
  durationMode:'FOREVER',
  endDate:null
};

test('Friday-only habit notifies on Friday, never on other weekdays',()=>{
  const createdDate='2026-11-17';
  for(const day of ['2026-11-17','2026-11-18','2026-11-19',
    '2026-11-21','2026-11-22','2026-11-23']){
    assert.equal(habitScheduledOnLocalDay(fixture,day,createdDate),false,day);
  }
  assert.equal(habitScheduledOnLocalDay(fixture,'2026-11-20',createdDate),true);
  assert.equal(habitScheduledOnLocalDay(fixture,'2026-11-27',createdDate),true);
  assert.equal(habitScheduledOnLocalDay(fixture,'2026-11-13',createdDate),false,
    'never fire before local creation day');
});

test('INTERVAL habit anchors repetition to local creation date across month boundary',()=>{
  const habit={...fixture,recurrenceType:'INTERVAL',intervalDays:3};
  for(const [date,expected] of [
    ['2026-11-29',false],['2026-11-30',true],
    ['2026-12-01',false],['2026-12-02',false],['2026-12-03',true]
  ] as const){
    assert.equal(habitScheduledOnLocalDay(habit,date,'2026-11-30'),expected,date);
  }
});

test('daily habit respects local creation and end date',()=>{
  const habit={...fixture,recurrenceType:'DAILY',durationMode:'UNTIL_DATE',
    endDate:new Date('2026-11-21T23:59:59.999Z')};
  assert.equal(habitScheduledOnLocalDay(habit,'2026-11-16','2026-11-17'),false);
  assert.equal(habitScheduledOnLocalDay(habit,'2026-11-18','2026-11-17'),true);
  assert.equal(habitScheduledOnLocalDay(habit,'2026-11-21','2026-11-17'),true);
  assert.equal(habitScheduledOnLocalDay(habit,'2026-11-22','2026-11-17'),false);
});

test('one server schedule gate protects both Telegram and Android/Mini App notifications',()=>{
  const source=readFileSync(new URL('../src/services/telegram.service.ts',import.meta.url),'utf8');
  const start=source.indexOf('for (const habit of habits)');
  const end=source.indexOf('const completion = await prisma.habitCompletion.aggregate',start);
  const chunk=source.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(chunk,/dateKeyInTimeZone\(now, habit\.user\.timeZone\)/);
  assert.match(chunk,/dateKeyInTimeZone\(habit\.createdAt, habit\.user\.timeZone\)/);
  assert.match(chunk,/if \(!habitScheduledOnLocalDay\(habit, currentDateKey, createdDateKey\)\) continue/);
  assert.ok(chunk.indexOf('habitScheduledOnLocalDay')<chunk.indexOf('reminderSnoozedUntil'));
  assert.ok(source.indexOf('const eventKey = \x60habit-reminder:')>start);
});

test('Android focus layout shows collaboration badge below heading and date control without clear icon',()=>{
  const ui=readFileSync(new URL(
    '../../android-app/app/src/main/java/ru/planirovych/app/feature/home/MiniAppTaskFocusSheet.kt',
    import.meta.url),'utf8');
  const header=ui.indexOf('BasicTextField(value=title');
  const badge=ui.indexOf('Text("Совместная задача"');
  const date=ui.indexOf('Text(if(dueDate==null)"Выбрать дату" else "Заменить дату"');
  assert.ok(header>=0&&header<badge&&badge<date);
  assert.doesNotMatch(ui,/Icon\(Icons\.Default\.Close,"Убрать срок"/);
  assert.match(ui,/\.clickable\s*\{collaborationOpen=true\}/);
});

test('new Android release version is incremented for Play and GitHub updates',()=>{
  const gradle=readFileSync(new URL('../../android-app/app/build.gradle.kts',import.meta.url),'utf8');
  assert.match(gradle,/versionCode = 25/);
  assert.match(gradle,/versionName = "1\.0\.23"/);
});
