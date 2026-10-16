import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalizeTelegramAssistantProjects, TELEGRAM_ASSISTANT_MANAGED_PROJECT } from '../src/lib/ai-chat-project-sync.js';
import { validateTelegramAiChatSettings, DEFAULT_TELEGRAM_AI_CHAT_SETTINGS } from '../src/services/telegram-ai-chat-policy.service.js';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const policies = [
  { id: 'policy-1', chatTitle: 'Работа' }, { id: 'policy-2', chatTitle: 'Друзья' }
];

test('server canonicalizes Telegram project to exactly the authorized policy list', () => {
  const fake = Array.from({ length: 150 }, (_, index) => ({
    id: 'random-ghost-' + index, title: 'Новый чат', messages: []
  }));
  const oldMessages = [{ id: 'unique-answer', role: 'assistant', content: 'Сохранённый ответ' }];
  const projects = [
    { id: 'personal', title: 'Личный проект', icon: '✨', color: '#8b5cf6', chats: [{ id: 'quick-ai-requests', title: 'Быстрые запросы', messages: [] }] },
    { id: TELEGRAM_ASSISTANT_MANAGED_PROJECT, title: 'Телеграм ассистент', icon: 'telegram', chats: [
      ...fake, { id: 'telegram-ai-assistant:policy-1', title: 'Устаревшее имя', messages: oldMessages },
      { id: 'telegram-ai-assistant:deleted-policy', title: 'Удалённый', messages: [] },
      { id: 'telegram-ai-assistant:policy-1', title: 'Дубликат', messages: oldMessages }
    ] },
    { id: 'other-duplicate', title: 'Телеграм ассистент', icon: 'telegram', chats: fake }
  ];
  const canonical = canonicalizeTelegramAssistantProjects(projects, policies);
  assert.equal(canonical.length, 2);
  assert.equal(canonical[0].id, 'personal');
  assert.equal(canonical[1].id, TELEGRAM_ASSISTANT_MANAGED_PROJECT);
  assert.deepEqual(canonical[1].chats?.map(c => c.id), [
    'telegram-ai-assistant:policy-1', 'telegram-ai-assistant:policy-2'
  ]);
  assert.equal(canonical[1].chats?.[0].title, 'Работа');
  assert.deepEqual(canonical[1].chats?.[0].messages, oldMessages);
  assert.equal(canonicalizeTelegramAssistantProjects(canonical, policies)[1].chats?.length, 2);
  assert.equal(canonicalizeTelegramAssistantProjects(canonical, [policies[0]])[1].chats?.length, 1);
  assert.equal(canonicalizeTelegramAssistantProjects(canonical, []).length, 1);
});

test('authorized policy count, not browser list, controls Telegram assistant navigation', () => {
  const api = source('../src/routes/api.ts');
  const mini = source('../../client/src/MiniApp.tsx');
  const web = source('../../client/src/App.tsx');
  assert.match(api, /const cleanPrevious = canonicalizeTelegramAssistantProjects/);
  assert.match(api, /const cleanIncoming = canonicalizeTelegramAssistantProjects/);
  assert.match(api, /res\.json\(\{ projects: canonicalizeTelegramAssistantProjects/);
  assert.match(mini, /activeAiChatProject\.id === 'telegram-ai-assistant-project'/);
  assert.match(mini, /chat\.id\.startsWith\('telegram-ai-assistant:'\)/);
  assert.match(mini, /project\.icon === 'telegram' \? <svg/);
  assert.match(web, /sanitizeCachedTelegramAssistantProjects\(normalized\)/);
});

test('attachment review is enabled by default and disabled explicitly, including prior clients', () => {
  assert.equal(validateTelegramAiChatSettings(DEFAULT_TELEGRAM_AI_CHAT_SETTINGS).reviewAttachments, true);
  assert.equal(validateTelegramAiChatSettings({ ...DEFAULT_TELEGRAM_AI_CHAT_SETTINGS, reviewAttachments: false }).reviewAttachments, false);
  const legacy = { ...DEFAULT_TELEGRAM_AI_CHAT_SETTINGS } as Partial<typeof DEFAULT_TELEGRAM_AI_CHAT_SETTINGS>;
  delete legacy.reviewAttachments;
  assert.equal(validateTelegramAiChatSettings(legacy).reviewAttachments, true);
  assert.throws(() => validateTelegramAiChatSettings({ ...DEFAULT_TELEGRAM_AI_CHAT_SETTINGS, reviewAttachments: 'false' }));
  const worker = source('../src/services/telegram-ai-monitor-worker.service.ts');
  assert.match(worker, /policy\.reviewAttachments \? \(policy\.summaryRequested \? 0 : lastSeen\) : undefined/);
  assert.match(worker, /policy\.reviewAttachments && m\.hasMedia/);
  const migration = source('../prisma/migrations/20261016170000_telegram_ai_media_opt_in/migration.sql');
  assert.match(migration, /DEFAULT true/);
});

test('save click is also explicit monitoring activation; manual start still remains for recovery', () => {
  const ui = source('../../client/src/components/TelegramAiAssistantSettings.tsx');
  assert.match(ui, /await api\.telegramAssistantSavePolicy\(selectedId, draft\);[\s\S]*await api\.telegramAssistantStart\(selectedId\)/);
  assert.match(ui, /checked=\{draft\.reviewAttachments\}/);
  assert.match(ui, /увеличивает расход кредитов/);
  assert.match(ui, /Настройки сохранены\. Мониторинг переписки включён/);
  assert.match(ui, /Включить мониторинг/);
});
