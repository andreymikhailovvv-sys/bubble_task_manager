import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGoogleCalendarMobileWebUrl, buildGoogleCalendarUrl, buildOutlookCalendarUrl } from './calendar.js';

const item = { title: 'Подготовить презентацию', description: 'Выступление для руководства', location: 'ВДНХ' };
const start = '2026-09-30T12:00:00.000Z';

test('Google URL содержит заполненные и корректно закодированные параметры', () => {
  const url = new URL(buildGoogleCalendarUrl(item, start, 60, 'Europe/Moscow'));
  assert.equal(url.origin, 'https://calendar.google.com');
  assert.equal(url.pathname, '/calendar/r/eventedit');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('text'), item.title);
  assert.equal(url.searchParams.get('details'), item.description);
  assert.equal(url.searchParams.get('location'), item.location);
  assert.equal(url.searchParams.get('dates'), '20260930T120000Z/20260930T130000Z');
  assert.equal(url.searchParams.get('stz'), 'Europe/Moscow');
  assert.equal(url.searchParams.get('etz'), 'Europe/Moscow');
  assert.match(url.toString(), /%D0%9F/);
});

test('мобильный Google Web URL содержит шаблон события и часовой пояс', () => {
  const url = new URL(buildGoogleCalendarMobileWebUrl(item, start, 60, 'Europe/Moscow'));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.pathname, '/calendar/render');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('text'), item.title);
  assert.equal(url.searchParams.get('dates'), '20260930T120000Z/20260930T130000Z');
  assert.equal(url.searchParams.get('details'), item.description);
  assert.equal(url.searchParams.get('location'), item.location);
  assert.equal(url.searchParams.get('ctz'), 'Europe/Moscow');
  assert.equal(url.searchParams.has('stz'), false);
  assert.equal(url.searchParams.has('etz'), false);
  assert.match(url.toString(), /%D0%9F/);
});

test('Outlook URL содержит заполненные и корректно закодированные параметры', () => {
  const url = new URL(buildOutlookCalendarUrl(item, start, 60));
  assert.equal(url.searchParams.get('rru'), 'addevent');
  assert.equal(url.searchParams.get('subject'), item.title);
  assert.equal(url.searchParams.get('body'), item.description);
  assert.equal(url.searchParams.get('location'), item.location);
  assert.equal(url.searchParams.get('startdt'), start);
  assert.equal(url.searchParams.get('enddt'), '2026-09-30T13:00:00.000Z');
  assert.match(url.toString(), /%D0%9F/);
});

for (const [duration, expected] of [[30, '12:30'], [60, '13:00'], [90, '13:30'], [120, '14:00']] as const) {
  test(`продолжительность ${duration} минут корректно вычисляет окончание`, () => {
    const url = new URL(buildOutlookCalendarUrl(item, start, duration));
    assert.match(url.searchParams.get('enddt') ?? '', new RegExp(`T${expected}:00\\.000Z$`));
  });
}
