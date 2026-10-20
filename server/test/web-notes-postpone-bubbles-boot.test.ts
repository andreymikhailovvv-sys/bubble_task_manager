import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildBubbles, getBubbleSectorIndex, getBubbleSectorSpheres } from '../../client/src/lib/layout.js';
import type { Sphere, Task } from '../../client/src/lib/types.js';

const spheres: Sphere[] = [
  { id: 'sphere-a', name: 'Работа', color: '#22d3ee' },
  { id: 'sphere-b', name: 'Личное', color: '#a78bfa' }
];
const task = (id: string, sphereId: string | null): Task => ({
  id, title: id, sphereId, priorityScore: 1, importance: 3, urgency: 3,
  status: 'TODO', dueDate: null
});

test('без сектора создаётся только временная область, а существующие сектора остаются на своих местах', () => {
  const tasks = [task('a', 'sphere-a'), task('b', null), task('c', 'sphere-b')];
  const groups = getBubbleSectorSpheres(tasks, spheres, 'sectors');
  assert.equal(groups.length, 3);
  assert.equal(groups[0]?.id, 'sphere-a');
  assert.equal(groups[1]?.id, 'sphere-b');
  assert.equal(groups[2], null);
  assert.equal(getBubbleSectorIndex(tasks[0], groups), 0);
  assert.equal(getBubbleSectorIndex(tasks[1], groups), 2);
  assert.equal(getBubbleSectorIndex(tasks[2], groups), 1);
  const bubbles = buildBubbles(tasks, spheres, 'sectors', 900);
  assert.equal(bubbles.find((item) => item.task.id === 'b')?.sectorIndex, 2);
  assert.equal(bubbles.find((item) => item.task.id === 'c')?.sectorIndex, 1);
});

test('при назначении последней задачи область исчезает; в глобальном режиме она не возникает', () => {
  const assigned = [task('a', 'sphere-a'), task('b', 'sphere-b')];
  assert.equal(getBubbleSectorSpheres(assigned, spheres, 'sectors').length, 2);
  assert.deepEqual(getBubbleSectorSpheres([task('x', null)], spheres, 'global'), []);
  assert.equal(getBubbleSectorSpheres([task('x', null)], spheres.slice(0, 1), 'sectors').length, 2);
});

test('удалённый или неизвестный сектор не подменяется первым', () => {
  const tasks = [task('x', 'deleted-sphere')];
  assert.equal(getBubbleSectorSpheres(tasks, spheres, 'sectors').at(-1), null);
  assert.equal(getBubbleSectorIndex(tasks[0], getBubbleSectorSpheres(tasks, spheres, 'sectors')), 2);
});

test('веб и Mini App: бейджи группы на заметках без контуров в обеих темах', async () => {
  const [css, workspace, mini] = await Promise.all([
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/StandaloneNotesWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(css, /\.standalone-group-note-label \{ border: 0; box-shadow: none; \}/);
  assert.match(css, /\.standalone-note-editor-group \{[\s\S]*?border: 0;/);
  assert.match(css, /body\[data-theme='dark'\] \.standalone-group-note-label/);
  assert.match(workspace, /standalone-group-note-label/);
  assert.match(mini, /StandaloneNotesWorkspace/);
});

test('массовое «Отложить» не меняет даты ни событиям, ни напоминаниям', async () => {
  const [server, desktop, mini] = await Promise.all([
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8')
  ]);
  const service = server.slice(server.indexOf('  postponeOverdueWithAi: async'), server.indexOf('  applyTimelineOptimization: async'));
  assert.equal((service.match(/taskType: \{ notIn: \['EVENT', 'REMINDER'\] \}/g) ?? []).length, 3);
  const webMethod = desktop.slice(desktop.indexOf('  const timelineOverdueTasks'), desktop.indexOf('  const postponeAllOverdueByAi'));
  assert.match(webMethod, /task\.taskType !== 'EVENT' && task\.taskType !== 'REMINDER'/);
  const mobileMethod = mini.slice(mini.indexOf('  const overdueTasks ='), mini.indexOf('  const timelineToday ='));
  assert.match(mobileMethod, /task\.taskType !== 'EVENT' && task\.taskType !== 'REMINDER'/);
});

test('загрузочный экран сайта появляется до запуска React, исчезает после данных и не активируется в Mini App', async () => {
  const [html, desktop, main] = await Promise.all([
    readFile(new URL('../../client/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/main.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(html, /workspace-boot-splash/);
  assert.match(html, /Твой день под контролем/);
  assert.match(html, /location\.pathname === '\/' && matchMedia\('\(min-width: 1025px\)'\)/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /boot-shine/);
  assert.match(desktop, /setInitialWorkspaceReady\(true\)/);
  assert.match(desktop, /authLoading \|\| \(currentUser && !initialWorkspaceReady\)/);
  assert.match(desktop, /classList\.remove\('web-workspace-preload'\)/);
  assert.match(main, /max-width: 1024px/);
});
