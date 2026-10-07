import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildCreditUsageExcelXml } from '../src/services/ai-credit-statistics.service.js';

test('подтверждённые списания пишутся отдельными CHARGE events', async () => {
  const [metering, dynamicBilling, assistant, tools] = await Promise.all([
    readFile(new URL('../src/services/ai-usage-metering.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/dynamic-responses-billing.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-chat-tools.service.ts', import.meta.url), 'utf8')
  ]);

  assert.match(metering, /billingMode: 'CHARGE'/);
  assert.match(dynamicBilling, /settleDynamicResponsesCall[\s\S]*recordAiCreditCharge/);
  assert.match(assistant, /feature: 'task_chat'/);
  assert.match(assistant, /feature: 'generate_task'/);
  assert.match(assistant, /feature: 'generate_subtasks'/);
  assert.match(assistant, /feature: 'optimize_timeline'/);
  assert.match(assistant, /feature: 'audio_transcription'/);
  assert.match(tools, /feature: 'web_search'/);
});

test('статистика доступна пользователю и администратору, а админ может скачать Excel', async () => {
  const [routes, api, app, mini, admin] = await Promise.all([
    readFile(new URL('../src/routes/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/AdminPage.tsx', import.meta.url), 'utf8')
  ]);

  assert.match(routes, /\/credits\/statistics/);
  assert.match(routes, /credit-statistics/);
  assert.match(routes, /credit-usage-export/);
  assert.match(api, /getCreditUsageStatistics/);
  assert.match(api, /adminDownloadCreditUsageExcel/);
  assert.match(app, />Статистика<\/button>/);
  assert.match(mini, />Статистика<\/button>/);
  assert.match(admin, /Выгрузить Excel/);
});

test('Excel-отчёт содержит каждое списание и корректно экранирует текст', () => {
  const xml = buildCreditUsageExcelXml({
    userLabel: 'Тест & Пользователь',
    month: '2026-10',
    timeZone: 'Europe/Moscow',
    rows: [
      { date: '2026-10-07', time: '10:15:00', feature: 'Создание задачи', model: 'GPT-6 Luna', creditsMilli: 1250 },
      { date: '2026-10-07', time: '11:00:00', feature: 'Помощь ИИ в задаче', model: 'GPT-6.1 Sol', creditsMilli: 2750 }
    ]
  });

  assert.match(xml, /Тест &amp; Пользователь/);
  assert.match(xml, /Создание задачи/);
  assert.match(xml, /GPT-6\.1 Sol/);
  assert.match(xml, />1\.25</);
  assert.match(xml, />2\.75</);
  assert.match(xml, />4</);
});
