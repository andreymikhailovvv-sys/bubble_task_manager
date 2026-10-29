import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { prisma } from '../src/db/prisma.js';
import { AI_CHAT_RATING_BONUS, grantAiChatRequestRating } from '../src/services/ai-request-rating.service.js';

const read = (name: string) => readFile(new URL(name, import.meta.url), 'utf8');

test('a successful AI request adds 0.1 once, preserving other rating buckets', async () => {
  const original = prisma.$transaction;
  const recorded = new Set<string>();
  let score = { task: 3, habit: 2, ai: 0.3, focus: 1 };
  let total = 6.3;
  let transactions = 0;
  (prisma as unknown as { $transaction: unknown }).$transaction = async (
    fn: (tx: any) => Promise<unknown>, config: { isolationLevel: string }
  ) => {
    transactions++;
    assert.equal(config.isolationLevel, 'Serializable');
    return fn({
      aiRequestRatingGrant: {
        findUnique: async ({ where }: any) => recorded.has(where.userId_requestKey.requestKey) ? { id: 'old' } : null,
        create: async ({ data }: any) => { recorded.add(data.requestKey); return { id: data.requestKey }; }
      },
      user: {
        findUnique: async () => ({
          efficiencyTaskScore: score.task, efficiencyHabitScore: score.habit,
          efficiencyAiScore: score.ai, efficiencyFocusScore: score.focus,
          efficiencyLastActivityAt: new Date(), timeZone: 'Europe/Moscow'
        }),
        update: async ({ data }: any) => {
          score = { task: data.efficiencyTaskScore, habit: data.efficiencyHabitScore,
            ai: data.efficiencyAiScore, focus: data.efficiencyFocusScore };
          total = data.efficiencyScore;
          return score;
        }
      }
    });
  };
  try {
    assert.equal(AI_CHAT_RATING_BONUS, 0.1);
    assert.equal(await grantAiChatRequestRating('user-1', 'task:abc'), true);
    assert.equal(await grantAiChatRequestRating('user-1', 'task:abc'), false);
    assert.equal(await grantAiChatRequestRating('user-1', 'general:abc'), true);
    assert.equal(score.ai, 0.5);
    assert.equal(total, 6.5);
    assert.equal(score.task, 3);
    assert.equal(score.habit, 2);
    assert.equal(score.focus, 1);
    assert.equal(recorded.size, 2);
    assert.equal(transactions, 3);
  } finally {
    (prisma as unknown as { $transaction: unknown }).$transaction = original;
  }
});

test('only completed chat requests earn rating, and focus timer earns the matching extra 0.1', async () => {
  const [controller, web, mobile, picker, style] = await Promise.all([
    read('../src/controllers/ai.controller.ts'),
    read('../../client/src/App.tsx'),
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/DateTimePickerWithApply.tsx'),
    read('../../client/src/styles.css')
  ]);
  assert.equal((controller.match(/await grantAiChatRequestRating\(/g) ?? []).length, 3);
  assert.match(controller, /kind === 'replay'/);
  assert.match(web, /pushFocusBonusMessage\('ai', 0\.1\)/);
  assert.match(web, /\+0,1 за запрос/);
  assert.match(mobile, /\+0,1 за запрос/);
  assert.match(picker, /previousTime\.slice\(3, 5\) !== nextTime\.slice\(3, 5\)/);
  assert.match(web, /id="topbar-overdue-list"/);
  assert.equal((web.match(/timeline-overdue-panel/g) ?? []).length, 1);
  assert.match(style, /\.topbar-overdue-popover/);
});
