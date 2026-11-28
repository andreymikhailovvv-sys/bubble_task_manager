import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAiHabitDuration, validateAiHabitCompletion, aiHabitDateKey, validateAiCreateHabitArgs } from '../src/services/ai-create-habit.service.js';

test('general AI habit tool accepts daily, weekly and interval schedules', () => {
  const daily = validateAiCreateHabitArgs({
    name: 'Выпить воду', icon: '💧', recurrenceType: 'DAILY', weekdays: [],
    intervalDays: null, reminderTimes: ['09:00', '21:00', '09:00'], targetCount: 8
  });
  assert.deepEqual(daily.reminderTimes, ['09:00', '21:00']);
  assert.equal(daily.targetCount, 8);
  const weekly = validateAiCreateHabitArgs({
    ...daily, recurrenceType: 'WEEKDAYS', weekdays: [5, 1, 3], intervalDays: null
  });
  assert.deepEqual(weekly.weekdays, [1, 3, 5]);
  const interval = validateAiCreateHabitArgs({
    ...daily, recurrenceType: 'INTERVAL', intervalDays: 3, weekdays: []
  });
  assert.equal(interval.intervalDays, 3);
});

test('general AI rejects malformed habit schedules and times rather than silently fixing them', () => {
  const base = {
    name: 'Читать', icon: '📚', recurrenceType: 'WEEKDAYS',
    weekdays: [1, 3, 5], intervalDays: null, reminderTimes: ['20:30'], targetCount: 1
  };
  for (const patch of [
    { weekdays: [] }, { weekdays: [7] }, { reminderTimes: ['25:30'] },
    { recurrenceType: 'INTERVAL', weekdays: [], intervalDays: 0 },
    { targetCount: 0 }, { name: ' ' }, { recurrenceType: 'INVALID' }
  ]) assert.throws(() => validateAiCreateHabitArgs({ ...base, ...patch }));
});

import { editTaskDescription } from '../src/services/ai-task-description.service.js';
test('habit duration is independent from the daily target and rejects invalid dates and totals', () => {
  const base = {name:'Читать',icon:'📚',recurrenceType:'DAILY',weekdays:[],intervalDays:null,reminderTimes:[],targetCount:3};
  assert.equal(validateAiCreateHabitArgs(base).durationMode,'FOREVER');
  assert.equal(validateAiCreateHabitArgs({...base,durationMode:'REPEAT_COUNT',totalRepeatTarget:30}).totalRepeatTarget,30);
  assert.equal(validateAiCreateHabitArgs({...base,durationMode:'UNTIL_DATE',endDate:'2027-01-31'}).endDate,'2027-01-31');
  assert.throws(()=>validateAiHabitDuration({durationMode:'UNTIL_DATE',endDate:'2027-02-30'}));
  assert.throws(()=>validateAiHabitDuration({durationMode:'REPEAT_COUNT',totalRepeatTarget:0}));
});
test('habit completion defaults to one, supports N and full-day without guessing local date',()=>{
  assert.deepEqual(validateAiHabitCompletion({}),{fullDay:false,amount:1});
  assert.deepEqual(validateAiHabitCompletion({amount:3}),{fullDay:false,amount:3});
  assert.deepEqual(validateAiHabitCompletion({fullDay:true,amount:null}),{fullDay:true,amount:99});
  assert.throws(()=>validateAiHabitCompletion({amount:0}));
  assert.equal(aiHabitDateKey(new Date('2026-11-27T22:30:00Z'),'Europe/Moscow'),'2026-11-28');
});
test('description append preserves long text and markup and rejects unsafe HTML',()=>{
  assert.equal(editTaskDescription('Исходный текст','Новый текст','append',false,'text'),'Исходный текст\n\nНовый текст');
  assert.equal(editTaskDescription('<h2>План</h2><p>Старое</p>','<p><b>Новое</b></p>','append',true,'html'),'<h2>План</h2><p>Старое</p><br><br><p><b>Новое</b></p>');
  assert.equal(editTaskDescription('x < y','<b>Новое</b>','append',false,'html'),'x &lt; y<br><br><b>Новое</b>');
  assert.throws(()=>editTaskDescription('старое','<img src=x onerror=alert(1)>','append',true,'html'));
  assert.throws(()=>editTaskDescription('старое','<p><b>x</p></b>','append',true,'html'));
  for (const isSubtask of [false,true]) {
    const original = 'x'.repeat(15000);
    assert.equal(editTaskDescription(original,'y','append',isSubtask,'text'), original+'\n\ny');
    const html = '<p>'+original+'</p>';
    assert.equal(editTaskDescription(html,'<p>Новый пункт</p>','append',isSubtask,'html'),html+'<br><br><p>Новый пункт</p>');
    assert.equal(editTaskDescription(original,original+'z','replace',isSubtask,'text'),original+'z');
  }
});
