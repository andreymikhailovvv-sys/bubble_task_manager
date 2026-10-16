import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Telegram text and voice calls force task auto-apply and persist their proposal references', () => {
  const telegram = source('../src/services/telegram.service.ts');
  const ai = source('../src/services/ai-assistant.service.ts');
  const tools = source('../src/services/ai-chat-tools.service.ts');
  assert.match(telegram, /telegram-voice:/);
  assert.match(telegram, /telegram-text:/);
  assert.match(telegram, /telegram-task:/);
  assert.ok((telegram.match(/autoApplyTaskActions: true/g) ?? []).length >= 3);
  assert.ok((telegram.match(/taskProposalId: result\.taskProposal\?\.id/g) ?? []).length >= 3);
  assert.match(ai, /autoApply: input\.autoApplyTaskActions === true \? true : undefined/);
  assert.match(tools, /source: input\.autoApplyTaskActions \? 'telegram_bot' : 'planner'/);
  assert.match(telegram, /recordAppliedTelegramBotTask/);
  assert.match(telegram, /telegram-create:/);
  assert.match(source('../src/services/ai-task-proposal.service.ts'), /status: 'APPLIED',[\\s\\S]*undoData: undoData/);
});

test('undo is owner-scoped, one-shot and rejects data added after AI actions', () => {
  const service = source('../src/services/ai-task-proposal.service.ts');
  const reversal = source('../src/services/ai-task-proposal-undo.service.ts');
  const api = source('../src/routes/api.ts');
  assert.match(api, /task-proposals\/:id\/undo', requireAuth, taskProposalSameOrigin/);
  assert.match(service, /captureProposalBefore/);
  assert.match(service, /captureProposalAfter/);
  assert.match(reversal, /status: 'APPLIED'/);
  assert.match(reversal, /status: 'UNDOING'/);
  assert.match(reversal, /status: 'UNDONE'/);
  assert.match(reversal, /await prisma\.\$transaction\(async tx =>/);
  assert.match(reversal, /createdState/);
  assert.match(reversal, /untrackedChildren/);
  assert.match(reversal, /updatedAt: new Date\(applied\.updatedAt\)/);
});

test('user sees undo action and human-friendly localized dates', () => {
  const component = source('../../client/src/components/AiTaskProposalCard.tsx');
  assert.match(component, /Intl\.DateTimeFormat\('ru-RU'/);
  assert.match(component, /humanDescription\(item\)/);
  assert.match(component, /api\.undoAiTaskProposal\(proposal\.id\)/);
  assert.match(component, />\s*Вернуть\s*<\/button>/);
  assert.doesNotMatch(component, /<span>\{item\.before\}<\/span>/);
});
