import { buildBubbles, buildSectorGeometry, getBubbleSectorIndex, getBubbleSectorSpheres, getTaskCoefficient, type BubbleRankingMode } from './layout';
import { linkedBubblePositions, type Bounds, type Point } from './bubbleInteractions';
import type { Sphere, Task } from './types';

export type BubbleLayoutMode = 'global' | 'sectors';

export type PackedBubble = {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  sectorIndex: number;
  distanceRatio: number;
  /** buildBubbles may use the earliest active subtask's due date. */
  effectiveDueDate: string | null | undefined;
};

export type BubbleLayoutRequest = {
  revision: string;
  modes: BubbleLayoutMode[];
  tasks: Task[];
  spheres: Sphere[];
  subtaskMap: Record<string, Task[]>;
  rankingMode: BubbleRankingMode;
  size: number;
  bounds: Pick<Bounds, 'minX' | 'minY' | 'maxX' | 'maxY' | 'ellipse'>;
};

export type BubbleLayoutSnapshot = {
  bubbles: PackedBubble[];
  positions: Array<[string, Point]>;
  initialMs: number;
  packingMs: number;
  candidateChecks: number;
  fallbackScans: number;
};

export type BubbleLayoutResponse =
  | { revision: string; mode: BubbleLayoutMode; snapshot: BubbleLayoutSnapshot }
  | { revision: string; mode: BubbleLayoutMode; error: string };

/** Heavy placement in the worker, reusing exactly the existing algorithms. */
export function computeBubbleLayout(
  request: Omit<BubbleLayoutRequest, 'revision' | 'modes'>,
  mode: BubbleLayoutMode
): BubbleLayoutSnapshot {
  const { tasks, spheres, subtaskMap, rankingMode, size, bounds } = request;
  const initialStarted = performance.now();
  const bubbles = buildBubbles(tasks, spheres, mode, size, rankingMode, subtaskMap);
  const initialMs = performance.now() - initialStarted;

  const sourceTaskById = new Map(tasks.map((task) => [task.id, task]));
  const sectorSpheres = getBubbleSectorSpheres(tasks, spheres, mode);
  const sectorCount = Math.max(1, sectorSpheres.length);
  const counts = Array.from({ length: sectorCount }, () => 0);
  if (sectorCount > 1) {
    for (const task of tasks) counts[getBubbleSectorIndex(task, sectorSpheres)] += 1;
  } else {
    counts[0] = tasks.length;
  }
  const sectorGeometry = buildSectorGeometry(sectorCount, counts);
  const radius = size * 0.47;
  const scaleX = (bounds.ellipse?.rx ?? radius) / radius;
  const scaleY = (bounds.ellipse?.ry ?? radius) / radius;
  const centreX = bounds.ellipse?.cx ?? size / 2;
  const centreY = bounds.ellipse?.cy ?? size / 2;
  const diagnostics = { candidateChecks: 0, fallbackScans: 0 };
  const packingStarted = performance.now();
  const positions = linkedBubblePositions(
    bubbles.map((bubble) => {
      const sourceTask = sourceTaskById.get(bubble.task.id) ?? bubble.task;
      const savedX = mode === 'global' ? bubble.task.bubbleGlobalX : bubble.task.bubbleSectorX;
      const savedY = mode === 'global' ? bubble.task.bubbleGlobalY : bubble.task.bubbleSectorY;
      return {
        id: bubble.task.id,
        x: centreX + (bubble.x - size / 2) * scaleX,
        y: centreY + (bubble.y - size / 2) * scaleY,
        radius: bubble.radius,
        sectorIndex: bubble.sectorIndex,
        coefficient: getTaskCoefficient(sourceTask, subtaskMap),
        linkedTaskIds: bubble.task.linkedTaskIds,
        bubbleLinkAnchorId: bubble.task.bubbleLinkAnchorId,
        pinned: typeof savedX === 'number' && typeof savedY === 'number'
      };
    }),
    {
      ...bounds,
      compact: true,
      diagnostics,
      hillSectors: mode === 'sectors' && sectorCount > 1 ? sectorGeometry : undefined,
      sectors: mode === 'sectors' && sectorCount > 1
        ? sectorGeometry.map((geometry) => ({
          start: { x: Math.cos(geometry.startAngle) * scaleX,
            y: Math.sin(geometry.startAngle) * scaleY },
          end: { x: Math.cos(geometry.endAngle) * scaleX,
            y: Math.sin(geometry.endAngle) * scaleY }
        }))
        : undefined
    }
  );
  const packingMs = performance.now() - packingStarted;

  return {
    bubbles: bubbles.map((bubble) => ({
      id: bubble.task.id,
      x: bubble.x, y: bubble.y, radius: bubble.radius,
      color: bubble.color, sectorIndex: bubble.sectorIndex,
      distanceRatio: bubble.distanceRatio,
      effectiveDueDate: bubble.task.dueDate
    })),
    positions: [...positions],
    initialMs, packingMs,
    candidateChecks: diagnostics.candidateChecks,
    fallbackScans: diagnostics.fallbackScans
  };
}
