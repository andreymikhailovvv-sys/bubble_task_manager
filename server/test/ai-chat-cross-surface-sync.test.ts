import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeChatProjectSnapshots, canonicalizeTelegramAssistantProjects } from '../src/lib/ai-chat-project-sync.js';
import { formatTelegramTaskChanges } from '../src/lib/telegram-task-change-receipt.js';
import { reconcileActiveAiChatMessages, reconcileAiChatProjectOutline, sanitizeCachedTelegramAssistantProjects, isTelegramAssistantProjectLike, isolateTaskProposalChips } from '../../client/src/lib/ai-chat-reconciliation.js';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('two devices can append messages to the same AI chat without overwriting either message', () => {
  const initial = [{ id: 'personal', chats: [
    { id: 'work-chat', title: 'Работа', messages: [{ id: 'm1', role: 'user', content: 'Привет' }] }
  ] }];
  const deviceA = [{ id: 'personal', chats: [
    { id: 'work-chat', title: 'Работа', messages: [
      { id: 'm1', role: 'user', content: 'Привет' },
      { id: 'm2', role: 'assistant', content: 'Ответ A' }
    ] }
  ] }];
  const deviceB = [{ id: 'personal', chats: [
    { id: 'work-chat', title: 'Работа', messages: [
      { id: 'm1', role: 'user', content: 'Привет' },
      { id: 'm3', role: 'assistant', content: 'Ответ B' }
    ] }
  ] }];
  const afterA = mergeChatProjectSnapshots(initial, deviceA);
  const afterB = mergeChatProjectSnapshots(afterA, deviceB);
  const saved = afterB[0].chats![0].messages!;
  assert.deepEqual(saved.map(m => m.id), ['m1', 'm2', 'm3']);
  assert.equal(saved.filter(m => m.id === 'm1').length, 1);
  assert.equal(saved[0].content, 'Привет');
});

test('updating project names does not remove existing chat text and stays within history bounds', () => {
  const original = [{ id: 'p', title: 'Было', chats: [{ id: 'chat', messages: [
    { id: 'a', role: 'user', content: 'Старое сообщение' }
  ] }] }];
  const revised = mergeChatProjectSnapshots(original, [{ id: 'p', title: 'Стало',
    chats: [{ id: 'chat', messages: [{ id: 'b', role: 'assistant', content: 'Новое сообщение' }] }]
  }]);
  assert.equal(revised[0].title, 'Стало');
  assert.deepEqual(revised[0].chats![0].messages!.map(m => m.content), ['Старое сообщение', 'Новое сообщение']);
});

test('Telegram bot reports actual applied task changes and not just a generic chip message', () => {
  assert.deepEqual(formatTelegramTaskChanges({
    status: 'APPLIED', operations: [
      { type: 'create_task', title: 'Позвонить врачу', dueDate: '2026-10-19T12:30:00Z' },
      { type: 'complete', title: 'Отправить договор' },
      { type: 'rename', title: 'Старое название', after: 'title: Новое название' }
    ]
  }, 'Europe/Riga').map(v => v.split(' «')[0]), [
    'Создал задачу', 'Отметил выполненным', 'Переименовал'
  ]);
  assert.match(formatTelegramTaskChanges({
    status: 'APPLIED', operations: [{ type: 'reschedule', title: 'Задача', dueDate: '2026-10-19T12:30:00Z' }]
  }, 'Europe/Riga')[0], /19 октября 2026/);
  assert.deepEqual(formatTelegramTaskChanges({ status: 'PENDING', operations: [] }), []);
  assert.match(formatTelegramTaskChanges({ status: 'FAILED', error: 'Нет доступа', operations: [] })[0], /не применены/);
});

test('both clients update only the open conversation, like task chat, and never poll entire projects', () => {
  const site = source('../../client/src/App.tsx');
  const mini = source('../../client/src/MiniApp.tsx');
  for (const script of [site, mini]) {
    assert.match(script, /api\.getAiChatThreadMessages\(projectId, chatId\)/);
    assert.match(script, /reconcileActiveAiChatMessages\(/);
    assert.match(script, /reconcileAiChatProjectOutline\(/);
    assert.match(script, /2[_,]?500/);
    assert.doesNotMatch(script, /12_000/);
    assert.match(script, /aiChatProjectsRemoteSnapshotRef\.current = JSON\.stringify\(updated\)/);
  }
  const activeApi = source('../src/routes/api.ts');
  assert.match(activeApi, /ai-chat\/projects\/:projectId\/chats\/:chatId\/messages/);
  assert.match(activeApi, /projectsOutline: outline/);
  const assistant = source('../src/services/ai-assistant.service.ts');
  const controller = source('../src/controllers/ai.controller.ts');
  assert.match(assistant, /createdAt: message\.createdAt\.toISOString\(\)/);
  assert.match(assistant, /id: message\.id/);
  assert.doesNotMatch(controller.slice(controller.indexOf('getGeneralAssistantHistory:'), controller.indexOf('askGeneralAssistant:')), /todayUtc/);
  const bot = source('../src/services/telegram.service.ts');
  assert.ok((bot.match(/listGeneralDialog\(\{ userId: session\.userId \}\)/g) ?? []).length >= 2);
});

test('chat reconciliation does not rerender identical messages or replace unsent optimistic tail', () => {
  const local = [{ id: 'a', role: 'user' as const, content: 'Текст' },
    { id: 'b', role: 'assistant' as const, content: 'Ответ' }];
  assert.strictEqual(reconcileActiveAiChatMessages(local, local.map(m => ({ ...m })), false), local);
  assert.strictEqual(reconcileActiveAiChatMessages(local, [local[0]], false), local);
  const changed = [{ ...local[0] }, { ...local[1], content: 'Новый ответ' }];
  assert.deepEqual(reconcileActiveAiChatMessages(local, changed, false), changed);
  assert.strictEqual(reconcileActiveAiChatMessages(local, changed, true), local);
});

test('project index reconciliation preserves every unchanged conversation and selected message object', () => {
  const messages = [{ id: 'a', role: 'user' as const, content: 'Отправлено' }];
  const local = [{ id: 'p', title: 'Личный проект', color: '#fff', icon: '✨',
    chats: [{ id: 'c', title: 'Тема', messages }] }];
  const sameOutline = [{ id: 'p', title: 'Личный проект', color: '#fff', icon: '✨',
    chats: [{ id: 'c', title: 'Тема' }] }];
  assert.strictEqual(reconcileAiChatProjectOutline(local, sameOutline), local);
  const renamed = reconcileAiChatProjectOutline(local, [{ ...sameOutline[0], chats: [{ id: 'c', title: 'Новая тема' }] }]);
  assert.notStrictEqual(renamed, local);
  assert.strictEqual(renamed[0].chats[0].messages, messages);
  assert.strictEqual(renamed[0].chats[0].title, 'Новая тема');
});

test('regression: 100 repeated project outline polls never multiply Telegram assistant folders', () => {
  const sharedMessages = [{ id: 'approved-1', role: 'assistant' as const, content: 'Разрешение на чтение' }];
  const chat = { id: 'telegram-ai-assistant:policy-1', title: 'Рабочий чат', messages: sharedMessages };
  const personal = { id: 'personal', title: 'Личный проект', color: '#888', icon: '✨',
    chats: [{ id: 'quick-ai-requests', title: 'Быстрые запросы', messages: [] }] };
  const telegram = { id: 'telegram-ai-assistant-project', title: 'Телеграм ассистент',
    color: '#229ed9', icon: 'telegram', chats: [chat] };
  const outline = [personal, telegram].map(project => ({
    ...project, chats: project.chats.map(item => ({ id: item.id, title: item.title }))
  }));
  let state = [personal, telegram];
  const first = reconcileAiChatProjectOutline(state, outline);
  assert.strictEqual(first, state, 'an unchanged outline should never allocate a new project tree');
  for (let i = 0; i < 100; i++) {
    state = reconcileAiChatProjectOutline(state, outline);
    assert.equal(state.length, 2);
    assert.equal(state.filter(project => project.id === 'telegram-ai-assistant-project').length, 1);
  }
  assert.strictEqual(state, first);
  assert.strictEqual(state[1].chats[0].messages, sharedMessages);
});

test('regression: inflated live Mini App state collapses to one Telegram folder during the very next poll', () => {
  const personal = { id: 'personal', title: 'Личный проект', color: '#aaa', icon: '✨',
    chats: [{ id: 'quick-ai-requests', title: 'Быстрые запросы', messages: [] }] };
  const telegram = { id: 'telegram-ai-assistant-project', title: 'Телеграм ассистент',
    color: '#229ed9', icon: 'telegram',
    chats: [{ id: 'telegram-ai-assistant:policy-1', title: 'Работа', messages: [
      { id: 'manual', role: 'user' as const, content: 'Моё сообщение' }
    ] }] };
  const ghost = { ...telegram, id: 'ghost-uuid', icon: '✨' };
  let projects = [personal, ...Array.from({ length: 200 }, () => telegram), ghost];
  const regularOutline = [{ id: 'personal', title: 'Личный проект', color: '#aaa', icon: '✨',
    chats: [{ id: 'quick-ai-requests', title: 'Быстрые запросы' }] }];
  for (let i = 0; i < 10; i++) {
    projects = reconcileAiChatProjectOutline(projects, [...regularOutline, {
      id: 'telegram-ai-assistant-project', title: 'Телеграм ассистент', color: '#229ed9',
      icon: 'telegram', chats: [{ id: 'telegram-ai-assistant:policy-1', title: 'Работа' }]
    }]);
    assert.equal(projects.length, 2);
    assert.equal(projects[1].chats[0].messages[0].content, 'Моё сообщение');
  }
  assert.equal(sanitizeCachedTelegramAssistantProjects(projects), projects);
  assert.equal(isTelegramAssistantProjectLike(ghost), true);
  assert.equal(isTelegramAssistantProjectLike(personal), false);
});

test('legacy duplicate folder with a generated UUID and text icon is excluded from normal projects', () => {
  const ghost = { id: 'random', title: 'Телеграм ассистент', color: '#229ed9', icon: '✨',
    chats: [{ id: 'telegram-ai-assistant:policy-1', title: 'Работа', messages: [] }] };
  const fixed = sanitizeCachedTelegramAssistantProjects([ghost]);
  assert.equal(fixed.length, 1);
  assert.equal(fixed[0].id, 'telegram-ai-assistant-project');
  assert.equal(fixed[0].icon, 'telegram');
  assert.equal(sanitizeCachedTelegramAssistantProjects(fixed), fixed);
});

test('cross-chat legacy proposal duplicates are excluded without deleting real independent dialogue', () => {
  const duplicate = {
    id: 'legacy-id', role: 'assistant', content: 'Предлагаю действия',
    taskProposal: { id: 'same-proposal' }
  };
  const raw = [{ id: 'personal', chats: [
    { id: 'quick-ai-requests', title: 'Быстрые запросы', messages: [duplicate] },
    { id: 'another-chat', title: 'Новый чат', messages: [
      { ...duplicate, id: 'copied-id' },
      { id: 'different', role: 'user', content: 'Оригинальное сообщение' }
    ] }
  ] }];
  const server = canonicalizeTelegramAssistantProjects(raw, []);
  assert.deepEqual(server[0].chats?.[0].messages?.map(m => m.id), ['legacy-id']);
  assert.deepEqual(server[0].chats?.[1].messages?.map(m => m.id), ['different']);
  const client = isolateTaskProposalChips(raw);
  assert.deepEqual(client[0].chats[0].messages.map(m => m.id), ['legacy-id']);
  assert.deepEqual(client[0].chats[1].messages.map(m => m.id), ['different']);
});


test('project model belongs to one chat, survives stale device saves and quick chat stays Luna', () => {
  const initial = [{id:'p',chats:[
    {id:'quick-ai-requests',title:'Быстрые запросы',model:'gpt-6-luna',messages:[]},
    {id:'a',title:'Разработка',model:'gpt-5.4-mini',modelChangedAt:'2026-10-20T10:00:00Z',messages:[]},
    {id:'b',title:'Маркетинг',model:'gpt-6-luna',modelChangedAt:'2026-10-20T10:00:00Z',messages:[]}
  ]}];
  const selected = mergeChatProjectSnapshots(initial,[{id:'p',chats:[
    {id:'quick-ai-requests',model:'gpt-6.1-sol',messages:[]},
    {id:'a',model:'gpt-6.1-sol',modelChangedAt:'2026-10-21T12:00:00Z',messages:[]},
    {id:'b',model:'gpt-6-luna',modelChangedAt:'2026-10-20T10:00:00Z',messages:[]}
  ]}]);
  const stale = mergeChatProjectSnapshots(selected,initial);
  assert.equal(stale[0].chats![0].model,'gpt-6-luna');
  assert.equal(stale[0].chats![1].model,'gpt-6.1-sol');
  assert.equal(stale[0].chats![2].model,'gpt-6-luna');
  const older = reconcileAiChatProjectOutline([{
    id:'p',title:'Личный проект',color:'#888',icon:'✨',
    chats:[{id:'a',title:'Разработка',model:'gpt-6.1-sol',modelChangedAt:'2026-10-21T12:00:00Z',messages:[]}]
  }],[{id:'p',title:'Личный проект',color:'#888',icon:'✨',
    chats:[{id:'a',title:'Разработка',model:'gpt-5.4-mini',modelChangedAt:'2026-10-20T10:00:00Z'}]}]);
  assert.equal(older[0].chats[0].model,'gpt-6.1-sol');
  const newer = reconcileAiChatProjectOutline(older,[{id:'p',title:'Личный проект',color:'#888',icon:'✨',
    chats:[{id:'a',title:'Разработка',model:'gpt-5.4-mini',modelChangedAt:'2026-10-21T13:00:00Z'}]}]);
  assert.equal(newer[0].chats[0].model,'gpt-6.1-terra');
});

test('legacy Mini selection is upgraded to Terra when a project snapshot is merged', () => {
  const merged = mergeChatProjectSnapshots([], [{ id: 'p', chats: [
    { id: 'legacy', title: 'Legacy', model: 'gpt-5.4-mini', messages: [] }
  ] }]);
  assert.equal(merged[0].chats?.[0].model, 'gpt-6.1-terra');
});

test('web and mobile AI chat model is stored on the chosen thread, not one global selection', () => {
  const app = source('../../client/src/App.tsx');
  const mini = source('../../client/src/MiniApp.tsx');
  const cached = source('../../client/src/lib/ai-chat-storage.ts');
  const route = source('../src/routes/api.ts');
  for (const client of [app, mini]) {
    assert.match(client,/modelChangedAt: new Date\(\)\.toISOString\(\)/);
    assert.match(client,/readSavedAiChatModel\(activeAiChat\?\.model\)/);
    assert.match(client,/if \(activeAiChatId === QUICK_AI_CHAT_ID\) setQuickAiChatModel\(DEFAULT_QUICK_AI_CHAT_MODEL\)/);
  }
  assert.match(cached,/model: chat\.model/);
  assert.match(route,/typeof item\.model === 'string'/);
});
