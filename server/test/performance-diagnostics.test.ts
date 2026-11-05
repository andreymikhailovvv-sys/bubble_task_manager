import test from 'node:test';
import assert from 'node:assert/strict';
import { percentileUpperBoundMs, recordMeasurement, safePerformanceRoute } from '../src/lib/performance-diagnostics.js';

test('performance histograms count slow and failed calls and estimate bounded p95', () => {
  const stats = {
    count: 0, sumMs: 0, maxMs: 0, slow: 0, failures: 0, buckets: Array(13).fill(0) as number[]
  };
  for (const ms of [5, 22, 120, 1_500]) {
    recordMeasurement(stats, ms, 1_000, ms === 1_500);
  }
  assert.equal(stats.count, 4);
  assert.equal(stats.slow, 1);
  assert.equal(stats.failures, 1);
  assert.equal(stats.maxMs, 1_500);
  assert.equal(percentileUpperBoundMs(stats, 95), 2_000);
  assert.equal(percentileUpperBoundMs(stats, 50), 25);
});

test('telemetry uses only Express route templates, never raw URLs or secrets', () => {
  const req = { originalUrl: '/api/tasks/private-id/ai-chat?token=redacted', path: '/tasks/private-id/ai-chat', route: { path: '/tasks/:id/ai-chat' } };
  assert.equal(safePerformanceRoute(req as never), '/api/tasks/:id/ai-chat');
  assert.equal(safePerformanceRoute({ ...req, path: '/tasks/private-id/ai-chat' } as never), '/api/tasks/:id/ai-chat');
  assert.equal(safePerformanceRoute({ originalUrl: '/apis/tasks', route: { path: '/tasks' } } as never), 'non_api');
  assert.equal(safePerformanceRoute({ originalUrl: '/api/invite/secret', route: undefined } as never), '/api/unmatched');
  assert.equal(safePerformanceRoute({ originalUrl: '/api/tasks/id', route: { path: '/tasks/:id?secret' } } as never),
    '/api/unmatched');
  assert.equal(safePerformanceRoute({ originalUrl: '/miniapp/foo', route: undefined } as never), 'non_api');
});

test('a large number of samples stays in constant-size histogram storage', () => {
  const stats = {
    count: 0, sumMs: 0, maxMs: 0, slow: 0, failures: 0, buckets: Array(13).fill(0) as number[]
  };
  for (let i = 0; i < 10_000; i++) recordMeasurement(stats, i % 5_000, 2_000);
  assert.equal(stats.count, 10_000);
  assert.equal(stats.buckets.length, 13);
  assert.equal(stats.buckets.reduce((a, b) => a + b, 0), stats.count);
});
