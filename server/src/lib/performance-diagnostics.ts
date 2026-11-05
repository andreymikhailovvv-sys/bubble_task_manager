import type { Request, RequestHandler } from 'express';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

// Diagnostic-only telemetry: no request bodies, URLs, SQL text, IDs or user data.
// Default ON for a temporary investigation; set PERF_DIAGNOSTICS_ENABLED=false to disable.
export const performanceDiagnosticsEnabled = process.env.PERF_DIAGNOSTICS_ENABLED !== 'false';

const configuredWindow = Number(process.env.PERF_DIAGNOSTICS_WINDOW_MS);
const WINDOW_MS = Number.isFinite(configuredWindow) && configuredWindow >= 15_000 && configuredWindow <= 300_000
  ? configuredWindow : 30_000;
const configuredSlowHttp = Number(process.env.PERF_DIAGNOSTICS_SLOW_HTTP_MS);
const SLOW_HTTP_MS = Number.isFinite(configuredSlowHttp) && configuredSlowHttp > 0 ? configuredSlowHttp : 2_000;
const configuredSlowDb = Number(process.env.PERF_DIAGNOSTICS_SLOW_DB_MS);
const SLOW_DB_MS = Number.isFinite(configuredSlowDb) && configuredSlowDb > 0 ? configuredSlowDb : 250;
const MAX_GROUPS = 80;
const BOUNDS_MS = [10, 25, 50, 100, 250, 500, 1_000, 2_000, 5_000, 10_000, 30_000, 60_000, Infinity] as const;

type Measurements = {
  count: number;
  sumMs: number;
  maxMs: number;
  slow: number;
  failures: number;
  buckets: number[];
};
type Group = Measurements & { name: string };

function emptyMeasurements(): Measurements {
  return { count: 0, sumMs: 0, maxMs: 0, slow: 0, failures: 0, buckets: BOUNDS_MS.map(() => 0) };
}

export function recordMeasurement(stats: Measurements, ms: number, thresholdMs: number, failed = false): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  stats.count += 1;
  stats.sumMs += ms;
  stats.maxMs = Math.max(stats.maxMs, ms);
  if (ms >= thresholdMs) stats.slow += 1;
  if (failed) stats.failures += 1;
  const bucket = BOUNDS_MS.findIndex(bound => ms <= bound);
  stats.buckets[bucket] += 1;
}

export function percentileUpperBoundMs(stats: Measurements, percentile: number): number | string | null {
  if (!stats.count) return null;
  const target = Math.ceil(stats.count * Math.max(0, Math.min(100, percentile)) / 100);
  let seen = 0;
  for (let i = 0; i < BOUNDS_MS.length; i++) {
    seen += stats.buckets[i];
    if (seen >= Math.max(1, target)) {
      return Number.isFinite(BOUNDS_MS[i]) ? BOUNDS_MS[i] : '>60000';
    }
  }
  return null;
}

const http = new Map<string, Measurements>();
const jobs = new Map<string, Measurements>();
const database = new Map<string, Measurements>();
let httpTotal = 0;
let dbTotal = 0;

function measure(map: Map<string, Measurements>, name: string, ms: number, threshold: number, failed: boolean) {
  if (!performanceDiagnosticsEnabled) return;
  const safeName = map.has(name) || map.size < MAX_GROUPS ? name : 'other';
  let stats = map.get(safeName);
  if (!stats) {
    stats = emptyMeasurements();
    map.set(safeName, stats);
  }
  recordMeasurement(stats, ms, threshold, failed);
}

/** Never derive telemetry labels from the raw request URL or user-supplied values. */
export function safePerformanceRoute(req: Pick<Request, 'path' | 'route'>): string {
  if (!req.path.startsWith('/api')) return 'non_api';
  const template: unknown = req.route?.path;
  if (typeof template !== 'string' || template.length > 110 || !/^\/[a-zA-Z0-9/:._*?-]*$/.test(template)) {
    return '/api/unmatched';
  }
  return '/api' + template;
}

export const performanceHttpMiddleware: RequestHandler = (req, res, next) => {
  if (!performanceDiagnosticsEnabled) { next(); return; }
  const started = performance.now();
  let recorded = false;
  const finish = () => {
    if (recorded) return;
    recorded = true;
    httpTotal += 1;
    const duration = performance.now() - started;
    // A closed connection before finishing is also a failure.
    const aborted = !res.writableFinished;
    measure(http, req.method + ' ' + safePerformanceRoute(req), duration, SLOW_HTTP_MS,
      aborted || res.statusCode >= 500);
  };
  res.once('finish', finish);
  res.once('close', finish);
  next();
};

/** Measure elapsed (wall-clock) time, including I/O waits; NOT per-worker CPU usage. */
export async function measureBackground<T>(name: string, work: () => Promise<T>): Promise<T> {
  if (!performanceDiagnosticsEnabled) return work();
  const started = performance.now();
  let failed = false;
  try {
    return await work();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    measure(jobs, name, performance.now() - started, SLOW_HTTP_MS, failed);
  }
}

/**
 * Prisma query events carry raw SQL and bindings. They must NEVER be written to
 * logs. Keep only the SQL verb + schema table identifier + numeric duration.
 * Query event duration excludes application-side waiting and client rendering.
 */
export function recordDatabaseQuery(query: string, durationMs: number): void {
  if (!performanceDiagnosticsEnabled) return;
  dbTotal += 1;
  const verb = /^(SELECT|INSERT|UPDATE|DELETE)\b/i.exec(query.trimStart())?.[1]?.toUpperCase() ?? 'OTHER';
  const table = /\b(?:FROM|INTO|UPDATE|JOIN)\s+(?:"[A-Za-z_][\w]*"\.)?"?([A-Za-z_][\w]*)"?/i.exec(query)?.[1] ?? 'unknown';
  measure(database, verb + ':' + table.slice(0, 48), durationMs, SLOW_DB_MS, false);
}

function snapshot(map: Map<string, Measurements>, limit: number): Array<Record<string, unknown>> {
  return [...map.entries()]
    .map(([name, entry]) => ({
      name, count: entry.count, slow: entry.slow, failures: entry.failures,
      avgMs: Math.round(entry.sumMs / entry.count),
      maxMs: Math.round(entry.maxMs),
      p95LeMs: percentileUpperBoundMs(entry, 95),
      totalWallMs: Math.round(entry.sumMs)
    }))
    .sort((a, b) => (b.totalWallMs as number) - (a.totalWallMs as number))
    .slice(0, limit);
}

let running = false;

/** Unref'd sampler; no HTTP endpoint or database writes and no telemetry uploads. */
export function startPerformanceDiagnostics(): void {
  if (running || !performanceDiagnosticsEnabled) return;
  running = true;
  const loopDelay = monitorEventLoopDelay({ resolution: 20 });
  loopDelay.enable();
  let previousCpu = process.cpuUsage();
  let previousTime = process.hrtime.bigint();
  let previousElu = performance.eventLoopUtilization();
  let previousAt = Date.now();
  console.info('[PerfDiag] enabled', {
    pid: process.pid, windowMs: WINDOW_MS, slowHttpMs: SLOW_HTTP_MS, slowDbMs: SLOW_DB_MS,
    dbDurations: 'Prisma query execution only', workerDurations: 'wall time including I/O'
  });

  const interval = setInterval(() => {
    const now = Date.now();
    const durationNs = process.hrtime.bigint() - previousTime;
    previousTime = process.hrtime.bigint();
    const intervalMs = Number(durationNs) / 1_000_000;
    const cpu = process.cpuUsage(previousCpu);
    previousCpu = process.cpuUsage();
    const cpuOneCorePct = intervalMs > 0
      ? Math.round(((cpu.user + cpu.system) / 1000) * 1000 / intervalMs) / 10 : 0;
    const elu = performance.eventLoopUtilization(previousElu);
    previousElu = performance.eventLoopUtilization();
    const memory = process.memoryUsage();
    const delayP95Ms = Math.round(loopDelay.percentile(95) / 1e6);
    const delayMaxMs = Math.round(loopDelay.max / 1e6);
    loopDelay.reset();

    const report = {
      at: new Date(now).toISOString(), pid: process.pid,
      windowMs: now - previousAt,
      cpuOneCorePct, eventLoopUtilPct: Math.round(elu.utilization * 1000) / 10,
      eventLoopDelayP95Ms: delayP95Ms, eventLoopDelayMaxMs: delayMaxMs,
      rssMb: Math.round(memory.rss / 1048576),
      heapUsedMb: Math.round(memory.heapUsed / 1048576),
      heapTotalMb: Math.round(memory.heapTotal / 1048576),
      uptimeSec: Math.round(process.uptime()),
      httpCount: httpTotal, dbQueryCount: dbTotal,
      httpTop: snapshot(http, 12),
      workerTop: snapshot(jobs, 20),
      databaseTop: snapshot(database, 12)
    };
    if (cpuOneCorePct >= 75 || delayMaxMs >= 200) console.warn('[PerfDiag] snapshot', report);
    else console.info('[PerfDiag] snapshot', report);
    previousAt = now;
    httpTotal = 0;
    dbTotal = 0;
    http.clear();
    jobs.clear();
    database.clear();
  }, WINDOW_MS);
  interval.unref();
}
