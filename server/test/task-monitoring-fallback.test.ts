import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { prisma } from '../src/db/prisma.js';
import {
  ensureMonitoringFallbackTrigger,
  MONITORING_FALLBACK_DELAY_MS,
  MONITORING_FALLBACK_QUESTION
} from '../src/services/task-monitoring-trigger.service.js';

const userId = 'owner';
const taskId = 'monitored-root';
const assistantCreatedAt = new Date('2026-10-24T14:00:00.000Z');

test('server fallback waits three hours and never replaces a custom AI trigger', async () => {
  const originalTransaction = prisma.$transaction;
  const created: Array<{ dueAt: Date; question: string }> = [];
  const updated: Array<{ dueAt: Date; question: string }> = [];
  let active = true;
  let userReplied = false;
  let pending: { id: string; question: string } | null = null;
  let isolation: string | undefined;

  (prisma as unknown as { $transaction: unknown }).$transaction = async (
    fn: (tx: any) => Promise<unknown>, options: { isolationLevel?: string }
  ) => {
    isolation = options.isolationLevel;
    return fn({
      task: { findFirst: async () => active ? { id: taskId } : null },
      taskAiMessage: { findFirst: async () => userReplied ? { id: 'recent-user-message' } : null },
      taskMonitoringTrigger: {
        findFirst: async () => pending,
        create: async ({ data }: { data: { dueAt: Date; question: string } }) => {
          created.push(data);
          pending = { id: 'fallback-1', question: data.question };
          return { id: 'fallback-1', ...data };
        },
        update: async ({ data }: { data: { dueAt: Date; question: string } }) => {
          updated.push(data);
          return { id: 'fallback-1', ...data };
        }
      }
    });
  };

  try {
    const before = Date.now();
    assert.equal(await ensureMonitoringFallbackTrigger({ userId, taskId, assistantCreatedAt }), 'scheduled');
    const after = Date.now();
    assert.equal(isolation, 'Serializable');
    assert.equal(created.length, 1);
    assert.equal(created[0].question, MONITORING_FALLBACK_QUESTION);
    assert.ok(created[0].dueAt.getTime() >= before + MONITORING_FALLBACK_DELAY_MS);
    assert.ok(created[0].dueAt.getTime() <= after + MONITORING_FALLBACK_DELAY_MS);

    // A newer assistant reply, without a new AI trigger, resets the same
    // fallback rather than creating more and more pending reminders.
    assert.equal(await ensureMonitoringFallbackTrigger({ userId, taskId, assistantCreatedAt }), 'refreshed');
    assert.equal(created.length, 1);
    assert.equal(updated.length, 1);

    // A custom trigger from the model or user must remain authoritative.
    pending = { id: 'custom-1', question: 'Проверить готовность к встрече в 19:00' };
    assert.equal(await ensureMonitoringFallbackTrigger({ userId, taskId, assistantCreatedAt }), 'custom-trigger');
    assert.equal(updated.length, 1);

    pending = null;
    userReplied = true;
    assert.equal(await ensureMonitoringFallbackTrigger({ userId, taskId, assistantCreatedAt }), 'answered');
    assert.equal(created.length, 1);

    userReplied = false;
    active = false;
    assert.equal(await ensureMonitoringFallbackTrigger({ userId, taskId, assistantCreatedAt }), 'inactive');
    assert.equal(created.length, 1);
  } finally {
    (prisma as unknown as { $transaction: unknown }).$transaction = originalTransaction;
  }
});

test('assistant responses and focus control wire the fallback and visible enabled state', async () => {
  const read = (p: string) => readFile(new URL(p, import.meta.url), 'utf8');
  const [ai, worker, status, css] = await Promise.all([
    read('../src/services/ai-assistant.service.ts'),
    read('../src/services/task-monitoring-worker.service.ts'),
    read('../../client/src/components/TaskMonitoringStatuses.tsx'),
    read('../../client/src/styles.css')
  ]);
  assert.match(ai, /const assistantMessage = await prisma\.taskAiMessage\.create/);
  assert.match(ai, /await ensureMonitoringFallbackTrigger\(/);
  assert.match(worker, /trigger\.question === MONITORING_FALLBACK_QUESTION/);
  assert.match(worker, /await hasMonitoringProgressSince\(trigger\)/);
  assert.match(worker, /state: 'pending', dueAt: \{ lte: now \}/);
  assert.match(status, /monitorEnabled \? 'task-monitor-button-active'/);
  assert.match(css, /\.task-monitor-button\.task-monitor-button-active/);
});
