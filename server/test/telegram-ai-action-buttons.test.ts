import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Telegram AI action replies include exact undo and Mini App quick chat buttons', () => {
  const bot = code('../src/services/telegram.service.ts');
  assert.match(bot, /text: '↩️ Отменить', callback_data: `aiundo:\$\{proposalId\}`/);
  assert.match(bot, /text: '📱 Открыть в приложении', web_app: \{ url: openUrl \}/);
  assert.match(bot, /url\.searchParams\.set\('openQuickAi', '1'\)/);
  assert.match(bot, /proposal\?\.status === 'APPLIED'/);
  assert.equal((bot.match(/keyboardForGeneralAiReply\(result\)/g) ?? []).length, 2);
  assert.match(bot, /keyboardForAppliedAiProposal\(result\.taskProposal, session\.activeTaskId\)/);
  assert.match(bot, /createdProposalId\s*\? telegramAiActionKeyboard/);
});

test('Telegram undo callback uses same owner-scoped reversal as the chip, without double application', () => {
  const bot = code('../src/services/telegram.service.ts');
  const service = code('../src/services/ai-task-proposal.service.ts');
  assert.match(bot, /if \(action === 'aiundo'\)/);
  assert.match(bot, /where: \{ id: userId, telegramChatId: chatId \}/);
  assert.match(bot, /\['telegram_bot', 'telegram_bot_task'\]\.includes\(existing\.source\)/);
  assert.match(bot, /if \(existing\.status === 'UNDONE'\)/);
  assert.match(bot, /const outcome = await undoTaskProposal\(userId, taskId\)/);
  assert.match(bot, /outcome\.status !== 'UNDONE'/);
  assert.match(bot, /editMessageReplyMarkup/);
  const undo = service.slice(service.indexOf('export async function undoTaskProposal('), service.indexOf('export async function recordAppliedTelegramBotTask('));
  assert.match(undo, /findFirst\(\{ where: \{ id, userId \} \}\)/);
  assert.match(undo, /if \(current\.status === 'APPLIED'\)\s*\{[\s\S]*?\.some\(isExistingHabitAction\)\)\s*throw new Error[\s\S]*?await undoStoredProposal\(userId, id\);\s*\}/);
  assert.equal((undo.match(/await undoStoredProposal\(userId, id\)/g) ?? []).length, 1);
});

test('Mini App deep link activates Quick requests after authentication, without changing task chat', () => {
  const mini = code('../../client/src/MiniApp.tsx');
  assert.match(mini, /const openQuickAi = \['1', 'true', 'yes'\]/);
  assert.match(mini, /else if \(launchParams\.openQuickAi\)/);
  assert.match(mini, /openTelegramAiChat/);
  assert.match(mini, /telegram-ai-assistant:/);
  assert.match(mini, /setActiveAiChatId\(QUICK_AI_CHAT_ID\)/);
  assert.match(mini, /setIsAiChatOpen\(true\)/);
  assert.match(mini, /launchParams\.openTelegramAiChat, loading, currentUser\?\.id/);
});

test('Telegram assistant task proposal callbacks use owner-bound chip approval and specific chat link', () => {
  const bot = code('../src/services/telegram.service.ts');
  assert.match(bot, /callback_data: 'tgpa:' \+ proposalId/);
  assert.match(bot, /callback_data: 'tgpr:' \+ proposalId/);
  assert.match(bot, /action === 'tgpa' \|\| action === 'tgpr'/);
  assert.match(bot, /source: 'telegram_assistant'/);
  assert.match(bot, /await applyTaskProposal\(userId, taskId\)/);
  assert.match(bot, /await rejectTaskProposal\(userId, taskId\)/);
  assert.match(bot, /url\.searchParams\.set\('openTelegramAiChat', policyId\)/);
});

test('direct text and voice requests from the bot automatically apply finance chips and retain shared history',()=>{
  const bot=code('../src/services/telegram.service.ts');
  const tools=code('../src/services/ai-chat-tools.service.ts');
  const service=code('../src/services/ai-assistant.service.ts');
  const repeats=code('../src/services/economic-operation-recurrence.service.ts');
  assert.equal((bot.match(/autoApplyEconomicActions: true/g)??[]).length,2);
  assert.equal((bot.match(/economicProposals: result\.economicProposals/g)??[]).length,2);
  assert.match(bot,/text: '📱 Посмотреть в приложении', web_app: \{ url: buildMiniAppQuickAiUrl\(\) \}/);
  assert.match(service,/autoApplyEconomicActions: input\.autoApplyEconomicActions === true/);
  assert.match(tools,/const autoApply=input\.autoApplyEconomicActions === true \|\|/);
  assert.doesNotMatch(repeats,/applyEconomicProposal\(/);
});
