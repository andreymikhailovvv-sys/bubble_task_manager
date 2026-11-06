import { useEffect, useMemo, useState } from 'react';
import type { BubbleRankingMode } from '../lib/layout';
import type { Sphere, Task } from '../lib/types';
import type { BubbleLayoutMode, BubbleLayoutRequest, BubbleLayoutResponse, BubbleLayoutSnapshot } from '../lib/bubbleLayoutCompute';
import type { Bounds } from '../lib/bubbleInteractions';

const MAX_LAYOUTS = 8;
const layoutCache = new Map<string, BubbleLayoutSnapshot>();
const recentByMode = new Map<BubbleLayoutMode, BubbleLayoutSnapshot>();

function remember(key: string, mode: BubbleLayoutMode, snapshot: BubbleLayoutSnapshot) {
  layoutCache.delete(key);
  layoutCache.set(key, snapshot);
  recentByMode.set(mode, snapshot);
  while (layoutCache.size > MAX_LAYOUTS) {
    const oldestKey = layoutCache.keys().next().value;
    if (!oldestKey) break;
    layoutCache.delete(oldestKey);
  }
}

/** Keep layout invalidation independent from UI-only task fields. */
function layoutKey(tasks: Task[], spheres: Sphere[], subtaskMap: Record<string, Task[]>, rankingMode: BubbleRankingMode) {
  const source = JSON.stringify([
    rankingMode,
    tasks.map((task) => [
      task.id, task.sphereId, task.status, task.dueDate, task.importance,
      task.urgency, task.priorityScore, task.aiMonitoringEnabled,
      task.bubbleGlobalX, task.bubbleGlobalY, task.bubbleSectorX, task.bubbleSectorY,
      task.linkedTaskIds, task.bubbleLinkAnchorId
    ]),
    spheres.map((sphere) => [sphere.id, sphere.color]),
    Object.entries(subtaskMap).map(([id, items]) => [
      id, items.map((item) => [item.id, item.status, item.dueDate])
    ])
  ]);
  // Two independent 32-bit hashes make cache keys short, and avoid repeatedly
  // copying large task descriptions to state, refs and worker replies.
  let h1 = 2166136261;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < source.length; i += 1) {
    const value = source.charCodeAt(i);
    h1 = Math.imul(h1 ^ value, 16777619);
    h2 = Math.imul(h2 ^ value, 2246822519);
  }
  return `${source.length}:${h1 >>> 0}:${h2 >>> 0}`;
}

type Parameters = {
  tasks: Task[];
  spheres: Sphere[];
  subtaskMap: Record<string, Task[]>;
  rankingMode: BubbleRankingMode;
  mode: BubbleLayoutMode;
  size: number;
  bounds: Pick<Bounds, 'minX' | 'minY' | 'maxX' | 'maxY' | 'ellipse'>;
};

/**
 * The expensive initial physics AND linked packing run off-thread.
 * Both modes are prefetched, so subsequent mode/fullscreen switches hit cache.
 * Stale worker results are dropped on data changes or unmount.
 */
export function useBubbleLayoutWorker({
  tasks, spheres, subtaskMap, rankingMode, mode, size, bounds
}: Parameters): BubbleLayoutSnapshot | null {
  const revision = useMemo(
    () => layoutKey(tasks, spheres, subtaskMap, rankingMode),
    [tasks, spheres, subtaskMap, rankingMode]
  );
  const [, notifyUpdated] = useState(0);
  const keyFor = (nextMode: BubbleLayoutMode) => `${revision}:${nextMode}`;

  useEffect(() => {
    const candidates: BubbleLayoutMode[] = [mode, mode === 'global' ? 'sectors' : 'global'];
    const modes = candidates.filter((candidate) => !layoutCache.has(keyFor(candidate)));
    if (modes.length === 0) return;
    let canceled = false;
    let worker: Worker | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const accept = (message: BubbleLayoutResponse) => {
      if (canceled || message.revision !== revision) return;
      if ('error' in message) {
        console.warn('[BubbleLayoutWorker] failed', { mode: message.mode, error: message.error });
        return;
      }
      const snapshot = message.snapshot;
      remember(keyFor(message.mode), message.mode, snapshot);
      if (snapshot.initialMs > 80 || snapshot.packingMs > 80) {
        console.warn('[BubbleLayoutSlow]', {
          stage: 'worker', mode: message.mode, taskCount: snapshot.bubbles.length,
          initialMs: Math.round(snapshot.initialMs),
          packingMs: Math.round(snapshot.packingMs),
          candidateChecks: snapshot.candidateChecks,
          fallbackScans: snapshot.fallbackScans
        });
      }
      notifyUpdated((previous) => previous + 1);
    };

    const input: Omit<BubbleLayoutRequest, 'revision' | 'modes'> = {
      tasks, spheres, subtaskMap, rankingMode, size, bounds
    };
    const runFallback = () => {
      // Only for browsers that block module workers. The normal path has no
      // main-thread physics whatsoever.
      fallbackTimer = setTimeout(() => {
        void import('../lib/bubbleLayoutCompute').then(({ computeBubbleLayout }) => {
          if (canceled) return;
          for (const candidate of modes) {
            if (canceled) return;
            try {
              accept({ revision, mode: candidate, snapshot: computeBubbleLayout(input, candidate) });
            } catch (error) {
              console.warn('[BubbleLayoutWorker] fallback failed', error);
            }
          }
        });
      }, 0);
    };

    try {
      worker = new Worker(new URL('../workers/bubbleLayout.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<BubbleLayoutResponse>) => accept(event.data);
      worker.onerror = (event) => {
        if (canceled) return;
        console.warn('[BubbleLayoutWorker] unavailable', event.message);
        worker?.terminate();
        worker = null;
        runFallback();
      };
      worker.postMessage({ revision, modes, ...input } satisfies BubbleLayoutRequest);
    } catch (error) {
      console.warn('[BubbleLayoutWorker] creation failed', error);
      runFallback();
    }

    return () => {
      canceled = true;
      worker?.terminate();
      if (fallbackTimer !== null) clearTimeout(fallbackTimer);
    };
    // Switching mode should read the already queued/cached result, not restart
    // the worker and discard the other mode's in-flight calculation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  // Retain the previous layout for this same mode while updated task data is
  // being processed. New/deleted tasks are reconciled by the rendering layer.
  return layoutCache.get(keyFor(mode)) ?? recentByMode.get(mode) ?? null;
}
