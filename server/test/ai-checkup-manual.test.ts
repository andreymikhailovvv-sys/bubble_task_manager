import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { reconcileAiChatMessagesWithChips } from '../../client/src/lib/ai-chat-reconciliation.js';

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('on-demand checkup uses the identical AI, billing and manual proposal pipeline', async () => {
  const delivery = await source('../src/services/ai-checkup-delivery.service.ts');
  const scheduled = await source('../src/index.ts');
  const api = await source('../src/routes/api.ts');
  assert.match(delivery, /generateDailyCheckup\(\{ userId: input\.userId, instructions: input\.instructions \}\)/);
  assert.match(delivery, /source: 'daily_checkup'/);
  assert.match(delivery, /autoApply: false/);
  assert.match(delivery, /creditsSpentMilli: checkup\.creditsSpentMilli/);
  assert.match(delivery, /appendGeneralDialogAssistantMessage/);
  assert.match(delivery, /taskProposal: await getTaskProposal/);
  assert.match(delivery, /requestId \|\| 'daily-checkup:manual:' \+ randomUUID\(\)/);
  assert.doesNotMatch(delivery.replace(/\/\*[\s\S]*?\*\//g, ''), /lastMorningAiCheckupDate|morningAiCheckupEnabled|morningAiCheckupTime/);
  assert.match(scheduled, /await createAiCheckup\(\{/);
  assert.match(scheduled, /sendTelegram: true/);
  assert.match(api, /post\('\/ai\/checkup\/generate', requireAuth, taskProposalSameOrigin/);
  assert.match(api, /createAiCheckup\(\{ userId: req\.user!\.id \}\)/);
  assert.match(api, /status\(201\)\.json\(result\)/);
  assert.match(api, /Cache-Control', 'no-store, private'/);
});

test('manual checkup works when auto scheduling is off and cannot consume its daily slot', async () => {
  const delivery = await source('../src/services/ai-checkup-delivery.service.ts');
  const index = await source('../src/index.ts');
  const route = await source('../src/routes/api.ts');
  assert.match(index, /aiCheckupRun\.create\(\{/);
  assert.match(index, /requestId: 'daily-checkup:' \+ local\.dateKey \+ ':' \+ schedule\.id/);
  assert.match(route, /await createAiCheckup\(\{ userId: req\.user!\.id \}\)/);
  assert.match(delivery, /if \(input\.sendTelegram\)/);
  assert.doesNotMatch(delivery.replace(/\/\*[\s\S]*?\*\//g, ''), /prisma\.user\.update|lastMorningAiCheckupDate/);
});

test('generate button appears in desktop and mini/mobile and opens the saved Quick AI message', async () => {
  const files = await Promise.all([
    source('../../client/src/App.tsx'),
    source('../../client/src/MiniApp.tsx'),
    source('../../client/src/lib/api.ts')
  ]);
  for (const ui of files.slice(0, 2)) {
    assert.match(ui, /Сформировать чекап сейчас/);
    assert.match(ui, /Формируем ИИ-чекап/);
    assert.match(ui, /manualCheckupLoading/);
    assert.match(ui, /api\.generateAiCheckupNow\(\)/);
    assert.match(ui, /reconcileAiChatMessagesWithChips\(chat\.messages, \[received\]\)/);
    assert.match(ui, /setActiveAiChatId\(QUICK_AI_CHAT_ID\)/);
    assert.match(ui, /setIsSettingsOpen\(false\)/);
    assert.match(ui, /setIsAiChatOpen\(true\)/);
    assert.match(ui, /formatAiRequestError\(error\)/);
  }
  assert.match(files[2], /generateAiCheckupNow: \(\) => request<\{ message: ChatMessage \}>/);
});

test('mini-app shows a just-generated checkup immediately, even before polling refresh', async () => {
  const mini = await source('../../client/src/MiniApp.tsx');
  assert.match(mini, /setLatestManualCheckup\(\{ userId: currentUser\.id, message: received \}\)/);
  assert.match(mini, /latestManualCheckup\?\.userId === currentUser\.id/);
  assert.match(mini, /reconcileAiChatMessagesWithChips\(activeAiChat\.messages, \[pinnedManualCheckup\]\)/);
  assert.match(mini, /visibleAiChatMessages\.map\(\(message\)/);
  assert.match(mini, /visibleAiChatMessages\.length === 0/);
  assert.match(mini, /setActiveAiChatId\(QUICK_AI_CHAT_ID\)/);
  assert.match(mini, /api\.getAiChatThreadMessages\(projectId, chatId\)/);
  const saved = { id: 'checkup-1', role: 'assistant' as const,
    content: '✨ ИИ-чекап', taskProposal: { id: 'proposal-1' } };
  const older: Array<{ id: string; role: 'assistant' | 'user'; content: string; taskProposal?: { id: string } }> = [
    { id: 'old-1', role: 'user', content: 'Привет' }
  ];
  const first = reconcileAiChatMessagesWithChips(older, [saved]);
  assert.deepEqual(first.map(message => message.id), ['old-1', 'checkup-1']);
  const confirmed = reconcileAiChatMessagesWithChips(first, [saved]);
  assert.equal(confirmed.length, 2, 'server confirmation must not duplicate the checkup');
  assert.equal(confirmed[1].taskProposal?.id, 'proposal-1');
});


test('several independent checkups can run on one local day without duplicate slot claims', async () => {
  const [{ resolveAiCheckupSchedules, validateAiCheckupSchedules }, index, schema, route, client] = await Promise.all([
    import('../src/lib/ai-checkup-schedules.js'),
    source('../src/index.ts'),
    source('../prisma/schema.prisma'),
    source('../src/routes/api.ts'),
    source('../../client/src/components/AiCheckupScheduleSettings.tsx')
  ]);
  const schedules = validateAiCheckupSchedules([
    { id: 'early', time: '09:00', instructions: 'Риски на сегодня' },
    { id: 'late', time: '19:30', instructions: 'Итоги дня' }
  ]);
  assert.equal(schedules.length, 2);
  assert.notEqual(schedules[0].instructions, schedules[1].instructions);
  assert.deepEqual(resolveAiCheckupSchedules(null, '11:45'), [{ id:'legacy',time:'11:45',instructions:'' }]);
  assert.deepEqual(resolveAiCheckupSchedules(schedules), schedules);
  assert.throws(() => validateAiCheckupSchedules([{ id:'x',time:'12:00',instructions:'' },{ id:'x',time:'13:00',instructions:'' }]));
  assert.throws(() => validateAiCheckupSchedules([{ id:'a',time:'25:00',instructions:'' }]));
  assert.throws(() => validateAiCheckupSchedules([{ id:'a',time:'12:00',instructions:'x'.repeat(1501) }]));
  assert.match(index, /for \(const schedule of schedules\)/);
  assert.match(index, /aiCheckupRun\.create/);
  assert.match(index, /instructions: schedule\.instructions/);
  assert.match(index, /P2002/);
  assert.match(schema, /@@unique\(\[userId, scheduleId, dateKey\]\)/);
  assert.match(route, /validateAiCheckupSchedules/);
  assert.match(client, /setExpanded\(false\)/);
  assert.match(client, /Добавить чекап/);
  assert.match(client, /Пожелания к этому чекапу/);
});

test('checkup settings have a collapsed downward chevron and independent monitoring-style switch', async () => {
  const component = await source('../../client/src/components/AiCheckupScheduleSettings.tsx');
  assert.match(component, /<ChevronDown size=\{15\}/);
  assert.match(component, /rotate-180/);
  assert.doesNotMatch(component, /ChevronRight/);
  assert.match(component, /role="switch" aria-checked=\{enabled\}/);
  assert.match(component, /task-monitor-mode-switch/);
  assert.match(component, /commit\(\{ morningAiCheckupEnabled: next \}\)/);
  assert.doesNotMatch(component, /type="checkbox"/);
});
