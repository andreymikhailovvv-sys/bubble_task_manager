import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('web autosave сразу синхронизирует изменённый сектор с локальными задачами', async () => {
  const source = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const autosaveStart = source.indexOf('const autosaveEditorTask = async');
  const autosaveEnd = source.indexOf('const createTaskFromAi = async', autosaveStart);
  assert.ok(autosaveStart >= 0 && autosaveEnd > autosaveStart);
  const autosave = source.slice(autosaveStart, autosaveEnd);

  assert.match(autosave, /const updatedTask = await api\.updateTask/);
  assert.match(autosave, /setTasks\(\(current\) => current\.map\(\(task\) => task\.id === updatedTask\.id \? \{ \.\.\.task, \.\.\.updatedTask \} : task\)\)/);

  const focusedSettings = source.slice(source.indexOf('focused-task-sector-button'), source.indexOf('focused-task-notify', source.indexOf('focused-task-sector-button')));
  assert.match(focusedSettings, /const nextSphereId = sphere\.id \|\| null/);
  assert.match(focusedSettings, /task\.id === focusedTask\.id \? \{ \.\.\.task, sphereId: nextSphereId \} : task/);
});

test('общий ИИ выбирает только реальные сектора и умеет менять сектор', async () => {
  const [assistant, tools, planner] = await Promise.all([
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-chat-tools.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/planner-tools.service.ts', import.meta.url), 'utf8')
  ]);

  assert.match(assistant, /При создании обычной задачи или события по возможности сам выбери наиболее подходящий пользовательский сектор/);
  assert.match(assistant, /сначала получи реальные сектора через list_sectors/);
  assert.match(assistant, /Если пользователь просит переместить задачу в другой сектор/);
  assert.match(assistant, /change_sphere/);
  assert.match(assistant, /change_task_sphere/);

  assert.match(tools, /name: 'list_sectors'/);
  assert.match(tools, /перед созданием задачи/);
  assert.match(tools, /'change_sphere'/);
  assert.match(tools, /sphereId: nullable\('string'\)/);

  assert.match(planner, /value\.operation === 'create_task' \|\| value\.operation === 'create_event'/);
  assert.match(planner, /resolvedSphereIds\.has\(value\.sphereId\)/);
  assert.match(planner, /if \(value\.operation === 'change_sphere'\) patch\.sphereId = value\.sphereId/);
  assert.match(planner, /Сначала получите сектор через list_sectors/);
});
