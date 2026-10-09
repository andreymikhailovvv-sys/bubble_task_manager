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

test('compact note previews shrink only before editing in mini app', async () => {
  const [mini, css] = await Promise.all([
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);
  assert.match(mini, /miniapp-task-description-preview/);
  assert.match(mini, /miniapp-subtask-description-preview/);
  assert.match(css, /\.task-description-preview\.miniapp-task-description-preview \{[\s\S]*?height: 5\.25rem/);
  assert.match(css, /\.task-description-preview\.miniapp-subtask-description-preview \{[\s\S]*?height: 4\.75rem/);
});

test('upcoming subtasks clip title, description and deadline within the row', async () => {
  const css = await readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.upcoming-subtask-copy \{[\s\S]*?display: grid;[\s\S]*?grid-template-rows:[^\n]+[\s\S]*?overflow: hidden;[\s\S]*?contain: paint;/);
  assert.match(css, /\.upcoming-subtask-description \{[\s\S]*?max-height: 2rem;[\s\S]*?-webkit-line-clamp: 2;/);
});
