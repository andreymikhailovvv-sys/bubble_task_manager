import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('profile login update canonicalizes, validates, checks ownership and relies on unique DB index', () => {
  const schema=read('../prisma/schema.prisma');
  const routes=read('../src/routes/api.ts');
  const reg=read('../src/services/account-registration.service.ts');
  const app=read('../../client/src/App.tsx');
  const mini=read('../../client/src/MiniApp.tsx');
  const api=read('../../client/src/lib/api.ts');
  assert.match(schema, /username\s+String\?\s+@unique/);
  assert.match(reg, /normalizeAccountLogin = \(value: string\) => value\.trim\(\)\.toLowerCase\(\)/);
  const profile=routes.slice(routes.indexOf("apiRouter.patch('/user/profile'"),routes.indexOf("apiRouter.delete('/user/account'"));
  assert.match(profile, /normalizeAccountLogin\(req\.body\.username\)/);
  assert.match(profile, /requestedUsername\.length < 3 \|\| requestedUsername\.length > 50/);
  assert.match(profile, /user\.passwordHash && !authService\.verifyPassword\(currentPassword, user\.passwordHash\)/);
  assert.match(profile, /prisma\.user\.findFirst\(/);
  assert.match(profile, /mode: 'insensitive'/);
  assert.match(profile, /usernameChanged \? \{ username: requestedUsername \}/);
  assert.match(profile, /error\.code === 'P2002'/);
  assert.match(profile, /Этот логин уже занят другим пользователем/);
  assert.match(app, /value=\{profileUsername\}/);
  assert.match(mini, /value=\{accountUsernameDraft\}/);
  assert.match(api, /username\?: string; currentPassword/);
});

test('bulk attachment removal only deletes signed-in user files after explicit confirmation', () => {
  const service=read('../src/services/task-attachment.service.ts');
  const controller=read('../src/controllers/task-attachment.controller.ts');
  const routes=read('../src/routes/api.ts');
  const client=read('../../client/src/lib/api.ts');
  const app=read('../../client/src/App.tsx');
  assert.match(service, /removeAllOwned: async \(userId: string\)/);
  assert.match(service, /prisma\.taskAttachment\.deleteMany\(\{ where: \{ userId \} \}\)/);
  assert.match(controller, /taskAttachmentService\.removeAllOwned\(req\.user!\.id\)/);
  assert.match(routes, /apiRouter\.delete\('\/user\/attachments', requireAuth, mailOrigin/);
  assert.match(client, /deleteAllAccountAttachments:/);
  assert.match(app, /window\.confirm\(\`Удалить все вложения/);
  assert.match(app, /attachmentStorage\.count/);
  assert.match(app, /setAccountAttachments\(\[\]\)/);
});

test("Mini App groups today's and later habits with small next weekday badge, theme-aware styles", () => {
  const mini=read('../../client/src/MiniApp.tsx');
  const css=read('../../client/src/styles.css');
  const start=mini.indexOf('  const sortedHabits = useMemo(');
  const end=mini.indexOf('  const timelineHabitPlacements',start);
  const sorting=mini.slice(start,end);
  assert.match(sorting, /!habit\.isAutoCompleted && !habit\.isArchived/);
  assert.match(sorting, /if \(aToday !== bToday\) return aToday \? -1 : 1/);
  assert.match(mini, /nextHabitScheduledDate/);
  assert.match(mini, /HABIT_WEEKDAY_SHORT/);
  assert.match(mini, /miniapp-habit-days-divider/);
  assert.match(mini, /miniapp-habit-day-badge/);
  assert.match(mini, /miniapp-habit-circle--offday/);
  assert.match(mini, /isCompleted \? 100 : progress/);
  assert.match(css, /\.miniapp-light \.miniapp-habit-day-badge/);
  assert.match(css, /\.miniapp-light \.miniapp-habit-circle--offday/);
  assert.match(css, /\.miniapp-habit-circle-completed \.miniapp-habit-circle-core/);
});

test('Android habits group by schedule with weekend/interval logic and filled completion', () => {
  const ui=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeScreen.kt');
  const primary=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/ModernWorkspace.kt');
  assert.match(primary, /state\.habits\.filter \{ !it\.isAutoCompleted && !it\.isArchived \}/);
  assert.match(primary, /val otherHabits = habits\.filterNot \{ habitScheduledToday\(it, today\) \}/);
  assert.match(primary, /workspaceHabitNextDay/);
  assert.match(primary, /other-day-divider/);
  assert.match(primary, /if \(done\) Color\.White/);
  assert.match(ui, /private fun habitScheduledOn\(habit: Habit, date: LocalDate\)/);
  assert.match(ui, /HabitRecurrenceType\.WEEKDAYS -> habit\.weekdays\.contains\(date\.dayOfWeek\.value % 7\)/);
  assert.match(ui, /HabitRecurrenceType\.INTERVAL/);
  assert.match(ui, /val otherDays = active\.filterNot \{ habitScheduledOn\(it, today\) \}/);
  assert.match(ui, /other-days-divider/);
  assert.match(ui, /nextHabitWeekday/);
  assert.match(ui, /done -> baseColor/);
  assert.match(ui, /if \(scheduledToday\) 1f else \.24f/);
});
