import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('web theme preference is a 3-state control and effective color is used for rendering', async () => {
  const source = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  assert.match(source, /\['light', 'dark', 'auto'\] as const/);
  assert.match(source, /resolveThemeMode\(themeMode, userTimeZone, new Date\(\)\)/);
  assert.match(source, /setInterval\(\(\) => setAutoThemeTick/);
  assert.match(source, /data-theme=\{effectiveThemeMode\}/);
  assert.match(source, /themeMode=\{effectiveThemeMode\}/);
  assert.match(source, /getCoefficientBadgeColor\(taskCoefficient, effectiveThemeMode\)/);
  assert.doesNotMatch(source, /backgroundImage|backgroundOverlayOpacity|handleBackgroundUpload|Фон рабочего пространства/);
});

test('Mini App has three theme modes, persisted choice and a user-time-zone clock', async () => {
  const mini = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  assert.match(mini, /\['light', 'dark', 'auto'\] as const/);
  assert.match(mini, /currentUser\?\.timeZone\?\.trim\(\)/);
  assert.match(mini, /resolveThemeMode\(miniThemeMode, userTimeZone, new Date\(\)\)/);
  assert.match(mini, /effectiveMiniTheme === 'light'/);
  assert.match(mini, /document\.body\.dataset\.theme = effectiveMiniTheme/);
  assert.match(mini, /localStorage\.setItem\('btm:miniapp-theme-mode', miniThemeMode\)/);
  assert.match(mini, /setInterval\(update, 30_000\)/);
  assert.match(mini, /visibilitychange/);
});

test('formatted-note previews match normal textarea height in Mini App', async () => {
  const [mini, css, editor] = await Promise.all([
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/TaskDescriptionInput.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(mini, /miniapp-task-description-preview[^"]*min-h-32/);
  assert.match(mini, /miniapp-subtask-description-preview[^"]*min-h-28/);
  assert.match(css, /\.task-description-preview\.miniapp-task-description-preview \{[\s\S]*?min-height: 8rem !important;[\s\S]*?height: 8rem;/);
  assert.match(css, /\.task-description-preview\.miniapp-subtask-description-preview \{[\s\S]*?min-height: 7rem !important;[\s\S]*?height: 7rem;/);
  assert.match(editor, /className=\{className\}/);
  assert.match(editor, /className=\{\`task-description-preview /);
});

test('upcoming subtasks clip title, description and deadline within the row', async () => {
  const css = await readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.upcoming-subtask-copy \{[\s\S]*?display: grid;[\s\S]*?grid-template-rows:[^\n]+[\s\S]*?overflow: hidden;[\s\S]*?contain: paint;/);
  assert.match(css, /\.upcoming-subtask-description \{[\s\S]*?max-height: 2rem;[\s\S]*?-webkit-line-clamp: 2;/);
});
