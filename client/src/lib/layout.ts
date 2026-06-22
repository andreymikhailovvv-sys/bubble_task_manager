import type { Sphere, Task } from './types';

export type BubbleRankingMode = 'urgency' | 'importance' | 'coefficient';

export type Bubble = {
  task: Task;
  x: number;
  y: number;
  radius: number;
  color: string;
  sectorIndex: number;
  distanceRatio: number;
};

export type SectorGeometry = {
  startAngle: number;
  endAngle: number;
  midAngle: number;
  span: number;
};

const FULL_CIRCLE_GEOMETRY: SectorGeometry[] = [{ startAngle: 0, endAngle: Math.PI * 2, midAngle: Math.PI, span: Math.PI * 2 }];

export const calcScore = (importance: number, urgency: number) => Number((importance * 0.6 + urgency * 0.4).toFixed(2));

const MOSCOW_TIMEZONE = 'Europe/Moscow';

function getMoscowNowMs() {
  const now = new Date();
  const moscowNow = new Date(now.toLocaleString('en-US', { timeZone: MOSCOW_TIMEZONE }));
  return moscowNow.getTime();
}

function getDueDateDiffMs(dueDate?: string | null) {
  if (!dueDate) return Number.POSITIVE_INFINITY;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return Number.POSITIVE_INFINITY;
  return due.getTime() - getMoscowNowMs();
}

function isOverdueNow(dueDate?: string | null) {
  return getDueDateDiffMs(dueDate) <= 0;
}

function getDueProximity(dueDate?: string | null) {
  const diffMs = getDueDateDiffMs(dueDate);
  if (!Number.isFinite(diffMs)) return 0;
  if (diffMs <= 0) return 1;
  const horizonMs = 1000 * 60 * 60 * 24 * 30;
  return Math.max(0, 1 - diffMs / horizonMs);
}

function getUrgencyWeight(dueDate?: string | null) {
  const diffMs = getDueDateDiffMs(dueDate);
  if (!Number.isFinite(diffMs)) return 0;
  if (diffMs <= 0) return 1;
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours <= 1) return 0.98;
  if (diffHours <= 3) return 0.94;
  if (diffHours <= 6) return 0.88;
  if (diffHours <= 12) return 0.8;
  if (diffHours <= 24) return 0.68;
  if (diffHours <= 72) return 0.52;
  if (diffHours <= 168) return 0.34;
  return Math.max(0.08, 0.28 - Math.min(0.2, diffHours / (24 * 45)));
}



function getUrgencyCoefficient(dueDate?: string | null) {
  const diffMs = getDueDateDiffMs(dueDate);
  if (!Number.isFinite(diffMs)) return 0;

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const anchors: Array<{ diffMs: number; coefficient: number }> = [
    { diffMs: -7 * day, coefficient: 0.7 },
    { diffMs: -3 * day, coefficient: 0.55 },
    { diffMs: -1 * day, coefficient: 0.45 },
    { diffMs: 0, coefficient: 0.35 },
    { diffMs: 10 * minute, coefficient: 0.15 },
    { diffMs: 30 * minute, coefficient: 0.07 },
    { diffMs: hour, coefficient: 0.05 }
  ];

  if (diffMs <= anchors[0].diffMs) return anchors[0].coefficient;
  if (diffMs > anchors[anchors.length - 1].diffMs) return 0;

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const left = anchors[i];
    const right = anchors[i + 1];

    if (diffMs > right.diffMs) continue;

    const range = right.diffMs - left.diffMs;
    if (range <= 0) return right.coefficient;

    const progress = (diffMs - left.diffMs) / range;
    const value = left.coefficient + (right.coefficient - left.coefficient) * progress;
    return Math.max(0, Math.round(value * 100) / 100);
  }

  return 0;
}

function getImportanceCoefficient(importance: number) {
  const map: Record<number, number> = { 1: 0.05, 2: 0.07, 3: 0.2, 4: 0.3, 5: 0.6 };
  return map[importance] ?? 0.15;
}

function getSubtaskDeadlineBoost(dueDate?: string | null) {
  const diffMs = getDueDateDiffMs(dueDate);
  if (!Number.isFinite(diffMs)) return 0;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs <= -7 * day) return 0.4;
  if (diffMs <= -3 * day) return 0.35;
  if (diffMs <= -1 * day) return 0.25;
  if (diffMs <= 0) return 0.15;
  if (diffMs <= 10 * minute) return 0.1;
  if (diffMs <= 30 * minute) return 0.05;
  if (diffMs <= hour) return 0.03;
  return 0;
}

export function getTaskCoefficient(task: Task, subtaskMap: Record<string, Task[]> = {}) {
  const subtaskBoost = (subtaskMap[task.id] ?? []).reduce((acc, subtask) => {
    if (subtask.status === 'DONE') return acc;
    return acc + getSubtaskDeadlineBoost(subtask.dueDate);
  }, 0);
  const score = getUrgencyCoefficient(task.dueDate) + getImportanceCoefficient(task.importance) + subtaskBoost;
  return Math.min(1, Number(score.toFixed(4)));
}

function getImportanceBubbleColor(importance: number) {
  const map: Record<number, string> = {
    1: '#38bdf8',
    2: '#22d3ee',
    3: '#a78bfa',
    4: '#fb923c',
    5: '#fb7185'
  };
  return map[importance] ?? '#60a5fa';
}

function compareTasksForRanking(a: Task, b: Task, rankingMode: BubbleRankingMode, subtaskMap: Record<string, Task[]>) {
  const overdueA = isOverdueNow(a.dueDate);
  const overdueB = isOverdueNow(b.dueDate);
  if (overdueA !== overdueB) return overdueA ? -1 : 1;

  if (rankingMode === 'coefficient') {
    const coefficientA = getTaskCoefficient(a, subtaskMap);
    const coefficientB = getTaskCoefficient(b, subtaskMap);
    if (coefficientA !== coefficientB) return coefficientB - coefficientA;
  }

  if (rankingMode === 'importance' && a.importance !== b.importance) {
    return b.importance - a.importance;
  }

  const diffA = getDueDateDiffMs(a.dueDate);
  const diffB = getDueDateDiffMs(b.dueDate);
  if (diffA !== diffB) return diffA - diffB;
  if (a.importance !== b.importance) return b.importance - a.importance;
  return b.priorityScore - a.priorityScore;
}

function polarToCartesian(center: number, angle: number, distance: number) {
  return {
    x: center + Math.cos(angle) * distance,
    y: center + Math.sin(angle) * distance
  };
}

function normalizeAngle(angle: number) {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}

function getSectorMinDistance(radius: number, sectorSpan: number) {
  if (sectorSpan >= Math.PI * 2) return 12;
  const halfSpan = Math.max(0.01, sectorSpan / 2);
  const boundaryPadding = 12;
  const minByGeometry = (radius + boundaryPadding) / Math.max(0.06, Math.sin(halfSpan));
  return Math.max(12, minByGeometry);
}

export function buildSectorGeometry(sectorCount: number, taskCounts: number[]): SectorGeometry[] {
  if (sectorCount <= 1) {
    return [{ startAngle: 0, endAngle: Math.PI * 2, midAngle: Math.PI, span: Math.PI * 2 }];
  }

  const full = Math.PI * 2;
  if (sectorCount <= 2) {
    return Array.from({ length: sectorCount }, (_, index) => {
      const startAngle = (full * index) / sectorCount;
      const endAngle = (full * (index + 1)) / sectorCount;
      return { startAngle, endAngle, midAngle: startAngle + (endAngle - startAngle) / 2, span: endAngle - startAngle };
    });
  }

  const safeCounts = Array.from({ length: sectorCount }, (_, index) => Math.max(1, taskCounts[index] ?? 0));
  const maxSpan = full / 2;
  const spans = Array.from({ length: sectorCount }, () => 0);
  const unlocked = new Set(safeCounts.map((_, index) => index));
  let remainingSpan = full;
  let remainingWeight = safeCounts.reduce((acc, count) => acc + count, 0);

  while (unlocked.size > 0 && remainingSpan > 0) {
    let limitedThisPass = false;
    unlocked.forEach((index) => {
      if (remainingWeight <= 0) return;
      const proposed = (safeCounts[index] / remainingWeight) * remainingSpan;
      if (proposed > maxSpan) {
        spans[index] = maxSpan;
        remainingSpan -= maxSpan;
        remainingWeight -= safeCounts[index];
        unlocked.delete(index);
        limitedThisPass = true;
      }
    });
    if (!limitedThisPass) break;
  }

  if (unlocked.size > 0) {
    unlocked.forEach((index) => {
      const span = remainingWeight > 0 ? (safeCounts[index] / remainingWeight) * remainingSpan : remainingSpan / unlocked.size;
      spans[index] = Math.min(maxSpan, span);
    });
  }

  let cursor = 0;
  return spans.map((span) => {
    const startAngle = cursor;
    const endAngle = cursor + span;
    cursor = endAngle;
    return { startAngle, endAngle, midAngle: startAngle + span / 2, span };
  });
}

function keepInSector(bubble: Bubble, center: number, maxDistance: number, sectorGeometry: SectorGeometry[]) {
  const dx = bubble.x - center;
  const dy = bubble.y - center;
  const safeMaxDistance = Math.max(0, maxDistance - bubble.radius - 12);
  const geometry = sectorGeometry[bubble.sectorIndex] ?? sectorGeometry[0];
  const minDistanceBySector = getSectorMinDistance(bubble.radius, geometry?.span ?? Math.PI * 2);
  const effectiveMinDistance = Math.min(minDistanceBySector, safeMaxDistance);
  let distance = Math.min(Math.hypot(dx, dy), safeMaxDistance);
  distance = Math.max(effectiveMinDistance, distance);

  let angle = normalizeAngle(Math.atan2(dy, dx));
  if (sectorGeometry.length > 1) {
    const sectorStart = geometry.startAngle;
    const sectorEnd = geometry.endAngle;
    const span = geometry.span;
    const maxPadding = Math.max(0, span / 2 - 0.01);
    const dynamicPadding = Math.asin(Math.min(0.95, (bubble.radius + 12) / Math.max(distance, bubble.radius + 12)));
    const padding = Math.min(maxPadding, dynamicPadding);
    const minAngle = sectorStart + padding;
    const maxAngle = sectorEnd - padding;
    angle = Math.min(maxAngle, Math.max(minAngle, angle));
  }

  bubble.x = center + Math.cos(angle) * distance;
  bubble.y = center + Math.sin(angle) * distance;
}


function resolveCollisions(bubbles: Bubble[], center: number, maxDistance: number, sectorGeometry: SectorGeometry[], padding: number, iterations: number) {
  for (let t = 0; t < iterations; t += 1) {
    for (let i = 0; i < bubbles.length; i += 1) {
      for (let j = i + 1; j < bubbles.length; j += 1) {
        const a = bubbles[i];
        const b = bubbles[j];
        if (sectorGeometry.length > 1 && a.sectorIndex !== b.sectorIndex) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 1;
        const minDist = a.radius + b.radius + padding;
        if (distance >= minDist) continue;
        const push = (minDist - distance) / 2;
        const nx = dx / distance;
        const ny = dy / distance;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        keepInSector(a, center, maxDistance, sectorGeometry);
        keepInSector(b, center, maxDistance, sectorGeometry);
      }
    }
  }
}

function applyGravity(
  bubbles: Bubble[],
  center: number,
  maxDistance: number,
  sectorGeometry: SectorGeometry[],
  targetDistanceById: Record<string, number>,
  gravityById: Record<string, number>
) {
  for (let t = 0; t < 190; t += 1) {
    bubbles.forEach((bubble) => {
      const dx = bubble.x - center;
      const dy = bubble.y - center;
      const currentDistance = Math.hypot(dx, dy) || 1;
      const nx = dx / currentDistance;
      const ny = dy / currentDistance;
      const targetDistance = targetDistanceById[bubble.task.id] ?? 18;
      const gravity = gravityById[bubble.task.id] ?? 0.5;
      const spring = (targetDistance - currentDistance) * (0.1 + gravity * 0.16);
      bubble.x += nx * spring;
      bubble.y += ny * spring;
      keepInSector(bubble, center, maxDistance, sectorGeometry);
    });

    resolveCollisions(bubbles, center, maxDistance, sectorGeometry, 0, 1);
  }
}

function getDistanceByRank(index: number, total: number, maxDistance: number, mode: 'global' | 'sectors') {
  const minDistance = 18;
  if (total <= 1) return minDistance;
  const densityFactor = Math.min(1, Math.max(0, (total - 1) / 28));
  const outerRatio = mode === 'global'
    ? 0.58 + densityFactor * 0.18
    : 0.68 + densityFactor * 0.2;
  const outerDistance = maxDistance * outerRatio;
  const rankRatio = index / (total - 1);
  const easedRatio = mode === 'global' ? Math.pow(rankRatio, 0.58) : Math.pow(rankRatio, 0.66);
  return minDistance + Math.max(18, outerDistance - minDistance) * easedRatio;
}

function getRadiusByRank(
  index: number,
  total: number,
  proximity: number,
  urgencyWeight: number,
  tieBoost: number,
  mode: 'global' | 'sectors',
  rankingMode: BubbleRankingMode,
  importance: number,
  overdueBoost: number,
  coefficient: number,
  sectorMaxCoefficient: number
) {
  const normalizedCoefficient = Math.max(0, Math.min(1, coefficient));
  const safeSectorMaxCoefficient = Math.max(0.0001, sectorMaxCoefficient);
  const relativeCoefficient = Math.max(0, Math.min(1, normalizedCoefficient / safeSectorMaxCoefficient));
  const maxRadius = mode === 'global' ? 92 : 82;

  if (rankingMode === 'coefficient') {
    const minReadableRadius = mode === 'global' ? 28 : 25;
    const scaledMaxRadius = mode === 'global' ? 104 : 94;
    const proportionalRadius = relativeCoefficient * scaledMaxRadius;
    const importanceSupport = (importance - 1) * (mode === 'global' ? 1 : 0.8);
    const radius = Math.max(minReadableRadius, proportionalRadius) + importanceSupport;
    return Math.max(minReadableRadius, Math.min(scaledMaxRadius, radius));
  }

  const rankRatio = total <= 1 ? 0 : index / (total - 1);
  const deadlineScale = 1 - rankRatio;
  const base = mode === 'global' ? 16 + deadlineScale * 44 : 17 + deadlineScale * 39;
  const proximityBoost = mode === 'global' ? proximity * 16 : proximity * 13;
  const urgencyBoost = mode === 'global' ? urgencyWeight * 25 : urgencyWeight * 21;
  const importanceBoost = rankingMode === 'importance' ? (importance - 1) * (mode === 'global' ? 6.4 : 5.2) : 0;
  const tieBonus = tieBoost * 5.5;
  const rawRadius = base + proximityBoost + urgencyBoost + importanceBoost + tieBonus + overdueBoost;
  return Math.max(16, Math.min(maxRadius, rawRadius));
}


function tuneBubbleRadiiToAvailableSpace(bubbles: Bubble[], maxDistance: number, sectorGeometry: SectorGeometry[], mode: 'global' | 'sectors') {
  const bubblesBySector = new Map<number, Bubble[]>();
  bubbles.forEach((bubble) => {
    const sectorBubbles = bubblesBySector.get(bubble.sectorIndex) ?? [];
    sectorBubbles.push(bubble);
    bubblesBySector.set(bubble.sectorIndex, sectorBubbles);
  });

  bubblesBySector.forEach((sectorBubbles, sectorIndex) => {
    if (sectorBubbles.length === 0) return;

    const geometry = sectorGeometry[sectorIndex] ?? sectorGeometry[0];
    const sectorArea = (geometry.span / (Math.PI * 2)) * Math.PI * maxDistance * maxDistance;
    const occupiedArea = sectorBubbles.reduce((sum, bubble) => sum + Math.PI * bubble.radius * bubble.radius, 0);
    if (occupiedArea <= 0 || sectorArea <= 0) return;

    const crowdingFactor = Math.min(1, Math.max(0, (sectorBubbles.length - 1) / 18));
    const targetOccupancy = mode === 'global'
      ? 0.48 + crowdingFactor * 0.14
      : 0.52 + crowdingFactor * 0.16;
    const areaScale = Math.sqrt((sectorArea * targetOccupancy) / occupiedArea);

    const minRadius = mode === 'global' ? 16 : 14;
    const maxRadius = mode === 'global' ? 168 : 156;
    const scale = Math.min(2.45, Math.max(0.36, areaScale));

    sectorBubbles.forEach((bubble) => {
      bubble.radius = Math.min(maxRadius, Math.max(minRadius, bubble.radius * scale));
    });
  });
}



function applyHierarchicalClustering(bubbles: Bubble[], center: number, maxDistance: number, sectorGeometry: SectorGeometry[]) {
  const bySector = new Map<number, Bubble[]>();
  bubbles.forEach((bubble) => {
    const list = bySector.get(bubble.sectorIndex) ?? [];
    list.push(bubble);
    bySector.set(bubble.sectorIndex, list);
  });

  bySector.forEach((sectorBubbles) => {
    const sorted = [...sectorBubbles].sort((a, b) => b.radius - a.radius);
    const largeCount = Math.max(1, Math.ceil(sorted.length * 0.18));
    const mediumCount = Math.max(1, Math.ceil(sorted.length * 0.34));
    const large = sorted.slice(0, largeCount);
    const medium = sorted.slice(largeCount, largeCount + mediumCount);
    const small = sorted.slice(largeCount + mediumCount);

    const nearest = (bubble: Bubble, anchors: Bubble[]) => {
      if (anchors.length === 0) return null;
      return anchors.reduce<{ anchor: Bubble; distance: number } | null>((best, anchor) => {
        const d = Math.hypot(bubble.x - anchor.x, bubble.y - anchor.y);
        if (!best || d < best.distance) return { anchor, distance: d };
        return best;
      }, null)?.anchor ?? null;
    };

    const pullToAnchor = (bubble: Bubble, anchor: Bubble, touchGap: number, factor: number) => {
      const dx = bubble.x - anchor.x;
      const dy = bubble.y - anchor.y;
      const dist = Math.hypot(dx, dy) || 1;
      const desired = anchor.radius + bubble.radius + touchGap;
      const closeRangeBonus = dist > desired ? Math.min(18, (dist - desired) * 0.28) : 0;
      const shift = (desired - closeRangeBonus - dist) * factor;
      bubble.x += (dx / dist) * shift;
      bubble.y += (dy / dist) * shift;
      keepInSector(bubble, center, maxDistance, sectorGeometry);
    };

    for (let i = 0; i < 40; i += 1) {
      medium.forEach((bubble) => {
        const anchor = nearest(bubble, large);
        if (anchor) pullToAnchor(bubble, anchor, -1, 0.62);
      });
      small.forEach((bubble) => {
        const biggerAnchors = [...large, ...medium].filter((anchor) => anchor.radius >= bubble.radius);
        const anchor = nearest(bubble, biggerAnchors.length > 0 ? biggerAnchors : large);
        if (anchor) pullToAnchor(bubble, anchor, -2, 0.72);
      });
      resolveCollisions(sectorBubbles, center, maxDistance, sectorGeometry, 0, 1);
    }
  });
}

function compactGlobalLayout(bubbles: Bubble[], center: number, maxDistance: number) {
  for (let t = 0; t < 130; t += 1) {
    bubbles.forEach((bubble) => {
      const dx = bubble.x - center;
      const dy = bubble.y - center;
      const currentDistance = Math.hypot(dx, dy) || 1;
      const normalizedUrgency = Math.min(1, Math.max(0, bubble.task.priorityScore / 5));
      const importanceBoost = Math.min(1, Math.max(0, (bubble.task.importance - 1) / 4));
      const centerBias = 0.2 + (normalizedUrgency * 0.55 + importanceBoost * 0.25);
      const desiredDistance = 12 + (1 - centerBias) * maxDistance * 0.62;
      const spring = (desiredDistance - currentDistance) * 0.15;
      const nx = dx / currentDistance;
      const ny = dy / currentDistance;
      bubble.x += nx * spring;
      bubble.y += ny * spring;
      keepInSector(bubble, center, maxDistance, FULL_CIRCLE_GEOMETRY);
    });

    resolveCollisions(bubbles, center, maxDistance, FULL_CIRCLE_GEOMETRY, 0, 1);
  }
}

export function buildBubbles(
  tasks: Task[],
  spheres: Sphere[],
  mode: 'global' | 'sectors',
  size: number,
  rankingMode: BubbleRankingMode = 'urgency',
  subtaskMap: Record<string, Task[]> = {}
): Bubble[] {
  const center = size / 2;
  const maxDistance = size * 0.44;
  const sectorCount = mode === 'sectors' && spheres.length > 1 ? spheres.length : 1;

  const getEffectiveDueDate = (task: Task) => {
    const parseDate = (value?: string | null) => {
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const taskDueDate = parseDate(task.dueDate);
    const activeSubtaskDates = (subtaskMap[task.id] ?? [])
      .filter((subtask) => subtask.status !== 'DONE')
      .map((subtask) => parseDate(subtask.dueDate))
      .filter((date): date is Date => Boolean(date));

    if (!taskDueDate && activeSubtaskDates.length === 0) return null;
    if (!taskDueDate) {
      return activeSubtaskDates.reduce((minDate, current) => (current < minDate ? current : minDate));
    }
    if (activeSubtaskDates.length === 0) return taskDueDate;
    const earliestSubtaskDueDate = activeSubtaskDates.reduce((minDate, current) => (current < minDate ? current : minDate));
    return earliestSubtaskDueDate < taskDueDate ? earliestSubtaskDueDate : taskDueDate;
  };

  const sourceTaskById = new Map(tasks.map((task) => [task.id, task]));
  const getSourceTask = (task: Task) => sourceTaskById.get(task.id) ?? task;

  const tasksWithEffectiveDueDate = tasks.map((task) => {
    const effectiveDueDate = getEffectiveDueDate(task);
    const effectiveDueDateIso = effectiveDueDate ? effectiveDueDate.toISOString() : task.dueDate ?? null;
    if (effectiveDueDateIso === task.dueDate) return task;
    return { ...task, dueDate: effectiveDueDateIso };
  });

  const bySector = Array.from({ length: sectorCount }, () => [] as Task[]);

  tasksWithEffectiveDueDate.forEach((task) => {
    const sectorIndex = sectorCount === 1 ? 0 : Math.max(0, spheres.findIndex((sphere) => sphere.id === task.sphereId));
    bySector[sectorIndex].push(task);
  });
  const sectorGeometry = buildSectorGeometry(sectorCount, bySector.map((sectorTasks) => sectorTasks.length));

  const result: Bubble[] = [];
  const targetDistanceById: Record<string, number> = {};
  const gravityById: Record<string, number> = {};

  bySector.forEach((sectorTasks, sectorIndex) => {
    const geometry = sectorGeometry[sectorIndex] ?? sectorGeometry[0];
    const startAngle = geometry.startAngle;
    const endAngle = geometry.endAngle;
    const sorted = [...sectorTasks].sort((a, b) => compareTasksForRanking(a, b, rankingMode, subtaskMap));

    const sectorMaxCoefficient = sorted.reduce((max, candidate) => Math.max(max, getTaskCoefficient(getSourceTask(candidate), subtaskMap)), 0);

    const dueCounts = sorted.reduce<Record<string, number>>((acc, task) => {
      const key = Number.isFinite(getDueDateDiffMs(task.dueDate)) ? new Date(task.dueDate as string).toISOString().slice(0, 16) : 'none';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const dueRanks: Record<string, number> = {};

    sorted.forEach((task, i) => {
      const proximity = getDueProximity(task.dueDate);
      const urgencyWeight = getUrgencyWeight(task.dueDate);
      const key = Number.isFinite(getDueDateDiffMs(task.dueDate)) ? new Date(task.dueDate as string).toISOString().slice(0, 16) : 'none';
      const rankInDue = dueRanks[key] ?? 0;
      dueRanks[key] = rankInDue + 1;
      const sameDueCount = dueCounts[key] ?? 1;
      const importanceTieBoost = sameDueCount > 1 ? (task.importance - 1) / 4 : 0;
      const overdueBoost = isOverdueNow(task.dueDate) ? 2.2 : 0;
      const coefficient = getTaskCoefficient(getSourceTask(task), subtaskMap);
      const radius = getRadiusByRank(i, sorted.length, proximity, urgencyWeight, importanceTieBoost, mode, rankingMode, task.importance, overdueBoost, coefficient, sectorMaxCoefficient);
      const distance = rankingMode === 'coefficient'
        ? 12 + Math.pow(1 - coefficient, 1.45) * Math.max(18, maxDistance * (mode === 'global' ? 0.6 : 0.78)) + i * 0.22
        : getDistanceByRank(i, sorted.length, maxDistance, mode);
      const rankRatio = sorted.length <= 1 ? 0 : i / (sorted.length - 1);
      targetDistanceById[task.id] = distance;
      gravityById[task.id] = 1 - rankRatio;
      const angle = mode === 'global'
        ? (i * 2.399963229728653) + rankInDue * 0.018
        : (() => {
          if (sectorCount === 2) {
            const midAngle = startAngle + (endAngle - startAngle) / 2;
            const laneShift = (rankInDue - (sameDueCount - 1) / 2) * 0.07;
            const ringShift = Math.floor(i / 5) * 0.045;
            return midAngle + laneShift + (sectorIndex === 0 ? -ringShift : ringShift);
          }
          const angleSpan = endAngle - startAngle;
          const midAngle = startAngle + angleSpan / 2;
          const slotCount = Math.max(4, Math.ceil(Math.sqrt(sorted.length + 1)));
          const ring = Math.floor(i / slotCount);
          const slot = i % slotCount;
          const wideSector = angleSpan >= Math.PI * 0.9;
          const usableSpan = wideSector ? angleSpan * 0.6 : angleSpan * 0.88;
          const localStart = midAngle - usableSpan / 2;
          const baseAngle = localStart + (usableSpan / (slotCount + 1)) * (slot + 1);
          const ringOffset = (ring % 2 === 0 ? 1 : -1) * (wideSector ? 0.028 : 0.05) + ring * (wideSector ? 0.008 : 0.015);
          const dueOffset = wideSector ? -rankInDue * 0.01 : -rankInDue * 0.02;
          return baseAngle + ringOffset + dueOffset;
        })();
      const point = polarToCartesian(center, angle, distance);
      result.push({
        task,
        x: point.x,
        y: point.y,
        radius,
        color: rankingMode === 'importance'
          ? getImportanceBubbleColor(task.importance)
          : spheres.find((s) => s.id === task.sphereId)?.color ?? '#60a5fa',
        sectorIndex,
        distanceRatio: Math.min(1, distance / maxDistance)
      });
    });
  });

  tuneBubbleRadiiToAvailableSpace(result, maxDistance, sectorGeometry, mode);

  result.forEach((bubble) => keepInSector(bubble, center, maxDistance, sectorGeometry));

  resolveCollisions(result, center, maxDistance, sectorGeometry, 0, 82);

  bySector.forEach((sectorTasks, sectorIndex) => {
    const sectorBubbles = result.filter((bubble) => bubble.sectorIndex === sectorIndex);
    const ranked = [...sectorTasks]
      .sort((a, b) => compareTasksForRanking(a, b, rankingMode, subtaskMap))
      .map((task) => sectorBubbles.find((bubble) => bubble.task.id === task.id))
      .filter((bubble): bubble is Bubble => Boolean(bubble));

    let previousDistance = 8;
    ranked.forEach((bubble, idx) => {
      const dx = bubble.x - center;
      const dy = bubble.y - center;
      const currentDistance = Math.hypot(dx, dy) || 1;
      const targetDistance = rankingMode === 'coefficient'
        ? 12 + Math.pow(1 - getTaskCoefficient(getSourceTask(bubble.task), subtaskMap), 1.45) * Math.max(18, maxDistance * (mode === 'global' ? 0.6 : 0.78)) + idx * 0.18
        : getDistanceByRank(idx, ranked.length, maxDistance, mode);
      const minDistance = idx === 0
        ? Math.max(12, targetDistance - 5)
        : Math.max(targetDistance - 14, previousDistance + bubble.radius * 0.12 + 2);
      const maxDistanceForRank = Math.min(maxDistance - bubble.radius - 4, minDistance + Math.max(7, bubble.radius * 0.36));
      if (currentDistance < minDistance || currentDistance > maxDistanceForRank) {
        const clampedDistance = Math.min(maxDistanceForRank, Math.max(minDistance, currentDistance));
        const nx = dx / currentDistance;
        const ny = dy / currentDistance;
        bubble.x = center + nx * clampedDistance;
        bubble.y = center + ny * clampedDistance;
        keepInSector(bubble, center, maxDistance, sectorGeometry);
      }
      previousDistance = Math.hypot(bubble.x - center, bubble.y - center);
      targetDistanceById[bubble.task.id] = minDistance;
    });
  });

  applyGravity(result, center, maxDistance, sectorGeometry, targetDistanceById, gravityById);

  if (mode === 'global') {
    compactGlobalLayout(result, center, maxDistance);
  }

  applyHierarchicalClustering(result, center, maxDistance, sectorGeometry);

  resolveCollisions(result, center, maxDistance, sectorGeometry, 0, 100);

  result.forEach((bubble) => {
    const dist = Math.hypot(bubble.x - center, bubble.y - center);
    bubble.distanceRatio = Math.min(1, dist / maxDistance);
  });

  return result;
}
