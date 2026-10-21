import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import type { Task } from '../../client/src/lib/types.js';
import type { StandaloneNote } from '../../client/src/lib/api.js';
import {
  searchWorkspace, noteSearchText, scoreWorkspaceRow
} from '../../client/src/lib/workspaceSearch.js';

const row = (id: string, title: string, description: string, parentTaskId?: string): Task =>
  ({id,title,description,parentTaskId,importance:3,urgency:3,priorityScore:50});
const note = (id:string,title:string,content:string):StandaloneNote =>
  ({id,title,content,groupId:null,createdAt:'2026-10-12T00:00:00Z',updatedAt:'2026-10-12T00:00:00Z'});

test('top search finds task title and description, child title and description, note title and formatted body', () => {
  const tasks = [
    row('t1','Выставка на ВДНХ','Подготовить маршрутный лист по экспозиции'),
    row('t2','Закупки','Согласовать материалы для сцены')
  ];
  const subtasks = [
    row('s1','Подготовить стенд','Проверить АФИНА на фотографии','t1'),
    row('s2','Договориться с организатором','Оформление выставки','t1')
  ];
  const notes = [
    note('n1','Идеи маршрута','<h1>Кураторские заметки</h1><ul><li>Афина на свирели</li></ul>'),
    note('n2','Контакты','<p>Данные по выставке</p>')
  ];
  const title = searchWorkspace(tasks,subtasks,notes,'выставка');
  assert.equal(title.task[0].id,'t1');
  assert.equal(title.subtask[0].id,'s2');
  assert.equal(title.note[0].id,'n2');
  assert.equal(title.subtask[0].context,'Выставка на ВДНХ');
  const byBody = searchWorkspace(tasks,subtasks,notes,'Афина');
  assert.equal(byBody.subtask[0].id,'s1');
  assert.equal(byBody.note[0].id,'n1');
  assert.equal(byBody.task.length,0);
  const description = searchWorkspace(tasks,subtasks,notes,'маршрутный лист');
  assert.equal(description.task[0].id,'t1');
  assert.ok(description.task[0].preview.includes('маршрутный лист'));
});

test('matching is case independent, Unicode-normalized and supports terms spread across fields', () => {
  const records=searchWorkspace([row('a','Ёлка','Записано в блокноте')],[],[],'елка блокноте');
  assert.equal(records.task[0].id,'a');
  const match=scoreWorkspaceRow({id:'a',kind:'task',title:'Очень нужная задача',description:''},'очень нужная');
  assert.ok(match && match.score>80);
});

test('rich text previews use text only, no HTML injection', () => {
  const plain=noteSearchText('<h1>Заголовок</h1><ol><li>Первая &amp; вторая</li></ol><script>alert("xss")</script>');
  assert.match(plain,/Заголовок/);
  assert.match(plain,/Первая & вторая/);
  assert.doesNotMatch(plain,/<|script|alert/);
});

test('bounded and empty results avoid massive dropdowns', () => {
  const tasks=Array.from({length:30},(_,i)=>row('task'+i,'Задача '+i,'Каталог'));
  const r=searchWorkspace(tasks,[],[],'задача',4);
  assert.equal(r.task.length,4);
  assert.deepEqual(searchWorkspace(tasks,[],[],'  '),{task:[],subtask:[],note:[]});
});

test('top search filters workspace as before and opens corresponding editors', async () => {
  const [app,component,notesWidget,css]=await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url),'utf8'),
    readFile(new URL('../../client/src/components/WorkspaceGlobalSearch.tsx',import.meta.url),'utf8'),
    readFile(new URL('../../client/src/components/StandaloneNotesWorkspace.tsx',import.meta.url),'utf8'),
    readFile(new URL('../../client/src/styles.css',import.meta.url),'utf8')
  ]);
  assert.match(app,/if \(search && !task\.title\.toLowerCase\(\)\.includes\(search\.toLowerCase\(\)\)\) return false/);
  assert.match(app,/<WorkspaceGlobalSearch/);
  assert.match(app,/onOpenTask=\{openTaskWithFocusGuard\}/);
  assert.match(app,/onOpenSubtask=\{\(subtask\) => setEditorState\(\{ task: subtask \}\)\}/);
  assert.match(app,/requestedNote=\{requestedStandaloneNote\}/);
  assert.match(component,/placeholder="Поиск"/);
  assert.match(component,/api\.getStandaloneNotes\(\)/);
  assert.match(component,/role="combobox"/);
  assert.match(component,/role="listbox"/);
  assert.match(component,/ArrowDown/);
  assert.match(component,/Escape/);
  assert.match(component,/onOpenNote\(item\.id\)/);
  assert.match(notesWidget,/requestedNote\?\.serial/);
  assert.match(notesWidget,/setEditing\(\{ \.\.\.note \}\)/);
  assert.match(css,/body\[data-theme='light'\] \.workspace-global-search-panel/);
  assert.match(css,/body\[data-theme='dark'\] \.workspace-global-search-panel/);
});


test('Mini App and mobile website share desktop global search, with note deep links and keyboard-safe results', async () => {
  const [mini, component, css] = await Promise.all([
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/WorkspaceGlobalSearch.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);
  // The same MiniApp component serves both Telegram and mobile web.
  assert.match(mini, /runtime === 'telegram'/);
  assert.match(mini, /runtime === 'web'/);
  assert.match(mini, /<WorkspaceGlobalSearch\s+mobile/);
  assert.match(mini, /value=\{taskSearch\}/);
  assert.match(mini, /tasks=\{tasks\}/);
  assert.match(mini, /subtasks=\{globalSearchSubtasks\}/);
  assert.match(mini, /onOpenTask=\{openTaskModal\}/);
  assert.match(mini, /onOpenSubtask=\{openSubtaskModal\}/);
  assert.match(mini, /setRequestedStandaloneNote\(\{ id, serial: Date\.now\(\) \}\)/);
  assert.match(mini, /requestedNote=\{requestedStandaloneNote\}/);
  assert.match(mini, /setIsHeaderVisible\(true\)/);
  assert.doesNotMatch(mini, /placeholder="Поиск по задачам"/);

  // No second search algorithm, no eager transfer of all note bodies.
  assert.match(component, /searchWorkspace\(tasks, subtasks, indexedNotes, value\)/);
  assert.match(component, /api\.getStandaloneNotes\(\)/);
  assert.match(component, /if \(!open \|\| !hasQuery \|\| !userId\) return/);
  assert.match(component, /window\.visualViewport/);
  assert.match(component, /visualViewport\?\.addEventListener\('resize', update\)/);
  assert.match(component, /workspace-global-search-panel-mobile/);
  assert.match(component, /aria-label="Свернуть результаты поиска"/);
  assert.match(component, /<ChevronUp size=\{13\}/);
  assert.match(component, /onClick=\{\(\) => \{ setOpen\(false\); anchorRef\.current\?\.querySelector\('input'\)\?\.blur\(\); \}\}/);
  assert.doesNotMatch(component, /Нажмите на результат, чтобы открыть его/);
  assert.match(css, /\.workspace-global-search-collapse\s*\{/);
  assert.match(css, /\.workspace-global-search-collapse:hover/);
  assert.match(css, /body\[data-theme='light'\] \.workspace-global-search-panel-mobile/);
  assert.match(css, /body\[data-theme='dark'\] \.workspace-global-search-panel-mobile/);
  assert.match(css, /\.miniapp-shell \.miniapp-global-search-field input/);
});
