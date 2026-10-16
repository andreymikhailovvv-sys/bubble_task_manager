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
  assert.ok((bot.match(/keyboardForAppliedAiProposal\(result\.taskProposal/g) ?? []).length >= 3);
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
  assert.match(service, /if \(current\.status === 'APPLIED'\) await undoStoredProposal\(userId, id\)/);
});

test('Mini App deep link activates Quick requests after authentication, without changing task chat', () => {
  const mini = code('../../client/src/MiniApp.tsx');
  assert.match(mini, /const openQuickAi = \['1', 'true', 'yes'\]/);
  assert.match(mini, /if \(!launchParams\.openQuickAi \|\| loading \|\| !currentUser\?\.id/);
  assert.match(mini, /setActiveAiChatId\(QUICK_AI_CHAT_ID\)/);
  assert.match(mini, /setIsAiChatOpen\(true\)/);
  assert.match(mini, /\[launchParams\.openQuickAi, loading, currentUser\?\.id\]/);
});
