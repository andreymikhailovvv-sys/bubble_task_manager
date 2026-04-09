import type { Sphere, Task } from './types';

export type Bubble = {
  task: Task;
  x: number;
  y: number;
  radius: number;
  color: string;
  sectorIndex: number;
  distanceRatio: number;
};

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

function getSectorHalfSpan(sectorCount: number) {
  return Math.PI / Math.max(1, sectorCount);
}

function getSectorMinDistance(radius: number, sectorCount: number) {
  if (sectorCount <= 1) return 12;
  const halfSpan = getSectorHalfSpan(sectorCount);
  const boundaryPadding = 12;
  const minByGeometry = (radius + boundaryPadding) / Math.max(0.06, Math.sin(halfSpan));
  return Math.max(12, minByGeometry);
}

function keepInSector(bubble: Bubble, center: number, maxDistance: number, sectorCount: number) {
  const dx = bubble.x - center;
  const dy = bubble.y - center;
  const safeMaxDistance = Math.max(0, maxDistance - bubble.radius - 12);
  const minDistanceBySector = getSectorMinDistance(bubble.radius, sectorCount);
  let distance = Math.min(Math.hypot(dx, dy), safeMaxDistance);
  distance = Math.max(minDistanceBySector, distance);

  let angle = normalizeAngle(Math.atan2(dy, dx));
  if (sectorCount > 1) {
    const sectorStart = (Math.PI * 2 * bubble.sectorIndex) / sectorCount;
    const sectorEnd = (Math.PI * 2 * (bubble.sectorIndex + 1)) / sectorCount;
    const span = sectorEnd - sectorStart;
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


function resolveCollisions(bubbles: Bubble[], center: number, maxDistance: number, sectorCount: number, padding: number, iterations: number) {
  for (let t = 0; t < iterations; t += 1) {
    for (let i = 0; i < bubbles.length; i += 1) {
      for (let j = i + 1; j < bubbles.length; j += 1) {
        const a = bubbles[i];
        const b = bubbles[j];
        if (sectorCount > 1 && a.sectorIndex !== b.sectorIndex) continue;
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
        keepInSector(a, center, maxDistance, sectorCount);
        keepInSector(b, center, maxDistance, sectorCount);
      }
    }
  }
}

function applyGravity(
  bubbles: Bubble[],
  center: number,
  maxDistance: number,
  sectorCount: number,
  targetDistanceById: Record<string, number>,
  gravityById: Record<string, number>
) {
  for (let t = 0; t < 120; t += 1) {
    bubbles.forEach((bubble) => {
      const dx = bubble.x - center;
      const dy = bubble.y - center;
      const currentDistance = Math.hypot(dx, dy) || 1;
      const nx = dx / currentDistance;
      const ny = dy / currentDistance;
      const targetDistance = targetDistanceById[bubble.task.id] ?? 18;
      const gravity = gravityById[bubble.task.id] ?? 0.5;
      const spring = (targetDistance - currentDistance) * (0.05 + gravity * 0.09);
      bubble.x += nx * spring;
      bubble.y += ny * spring;
      keepInSector(bubble, center, maxDistance, sectorCount);
    });

    resolveCollisions(bubbles, center, maxDistance, sectorCount, 8, 1);
  }
}

function getDistanceByDeadline(index: number, total: number, maxDistance: number, mode: 'global' | 'sectors') {
  const minDistance = 16;
  if (total <= 1) return minDistance;
  const compactOuter = mode === 'global'
    ? Math.min(maxDistance * 0.46, 34 + Math.sqrt(total) * 19)
    : Math.min(maxDistance * 0.54, 40 + Math.sqrt(total) * 26);
  const rankRatio = index / (total - 1);
  const easedRatio = mode === 'global' ? Math.pow(rankRatio, 0.58) : Math.pow(rankRatio, 0.72);
  return minDistance + Math.max(18, compactOuter - minDistance) * easedRatio;
}

function getRadiusByDeadline(
  index: number,
  total: number,
  proximity: number,
  urgencyWeight: number,
  tieBoost: number,
  mode: 'global' | 'sectors'
) {
  const rankRatio = total <= 1 ? 0 : index / (total - 1);
  const deadlineScale = 1 - rankRatio;
  const base = mode === 'global' ? 19 + deadlineScale * 35 : 20 + deadlineScale * 30;
  const proximityBoost = mode === 'global' ? proximity * 11 : proximity * 9;
  const urgencyBoost = mode === 'global' ? urgencyWeight * 17 : urgencyWeight * 14;
  const tieBonus = tieBoost * 4;
  const maxRadius = mode === 'global' ? 84 : 74;
  return Math.max(18, Math.min(maxRadius, base + proximityBoost + urgencyBoost + tieBonus));
}

export function buildBubbles(tasks: Task[], spheres: Sphere[], mode: 'global' | 'sectors', size: number): Bubble[] {
  const center = size / 2;
  const maxDistance = size * 0.44;
  const sectorCount = mode === 'sectors' && spheres.length > 1 ? spheres.length : 1;

  const bySector = Array.from({ length: sectorCount }, () => [] as Task[]);

  tasks.forEach((task) => {
    const sectorIndex = sectorCount === 1 ? 0 : Math.max(0, spheres.findIndex((sphere) => sphere.id === task.sphereId));
    bySector[sectorIndex].push(task);
  });

  const result: Bubble[] = [];
  const targetDistanceById: Record<string, number> = {};
  const gravityById: Record<string, number> = {};

  bySector.forEach((sectorTasks, sectorIndex) => {
    const startAngle = (Math.PI * 2 * sectorIndex) / sectorCount;
    const endAngle = (Math.PI * 2 * (sectorIndex + 1)) / sectorCount;
    const sorted = [...sectorTasks].sort((a, b) => {
      const diffA = getDueDateDiffMs(a.dueDate);
      const diffB = getDueDateDiffMs(b.dueDate);
      if (diffA !== diffB) return diffA - diffB;
      if (a.importance !== b.importance) return b.importance - a.importance;
      return b.priorityScore - a.priorityScore;
    });

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
      const radius = getRadiusByDeadline(i, sorted.length, proximity, urgencyWeight, importanceTieBoost, mode);
      const distance = getDistanceByDeadline(i, sorted.length, maxDistance, mode);
      const rankRatio = sorted.length <= 1 ? 0 : i / (sorted.length - 1);
      targetDistanceById[task.id] = distance;
      gravityById[task.id] = 1 - rankRatio;
      const angle = mode === 'global'
        ? (i * 2.399963229728653) + rankInDue * 0.018
        : (() => {
          const angleSpan = endAngle - startAngle;
          const slotCount = Math.max(4, Math.ceil(Math.sqrt(sorted.length + 1)));
          const ring = Math.floor(i / slotCount);
          const slot = i % slotCount;
          const baseAngle = startAngle + (angleSpan / (slotCount + 1)) * (slot + 1);
          const ringOffset = (ring % 2 === 0 ? 1 : -1) * (0.05 + ring * 0.015);
          const dueOffset = -rankInDue * 0.02;
          return baseAngle + ringOffset + dueOffset;
        })();
      const point = polarToCartesian(center, angle, distance);
      result.push({
        task,
        x: point.x,
        y: point.y,
        radius,
        color: spheres.find((s) => s.id === task.sphereId)?.color ?? '#60a5fa',
        sectorIndex,
        distanceRatio: Math.min(1, distance / maxDistance)
      });
    });
  });

  result.forEach((bubble) => keepInSector(bubble, center, maxDistance, sectorCount));

  resolveCollisions(result, center, maxDistance, sectorCount, mode === 'global' ? 4 : 8, 54);

  bySector.forEach((sectorTasks, sectorIndex) => {
    const sectorBubbles = result.filter((bubble) => bubble.sectorIndex === sectorIndex);
    const ranked = [...sectorTasks]
      .sort((a, b) => {
        const diffA = getDueDateDiffMs(a.dueDate);
        const diffB = getDueDateDiffMs(b.dueDate);
        if (diffA !== diffB) return diffA - diffB;
        if (a.importance !== b.importance) return b.importance - a.importance;
        return b.priorityScore - a.priorityScore;
      })
      .map((task) => sectorBubbles.find((bubble) => bubble.task.id === task.id))
      .filter((bubble): bubble is Bubble => Boolean(bubble));

    let previousDistance = 8;
    ranked.forEach((bubble, idx) => {
      const dx = bubble.x - center;
      const dy = bubble.y - center;
      const currentDistance = Math.hypot(dx, dy) || 1;
      const targetDistance = getDistanceByDeadline(idx, ranked.length, maxDistance, mode);
      const minDistance = idx === 0
        ? Math.max(12, targetDistance - 5)
        : Math.max(targetDistance - 12, previousDistance + bubble.radius * 0.2 + 4);
      const maxDistanceForRank = Math.min(maxDistance - bubble.radius - 6, minDistance + Math.max(8, bubble.radius * 0.45));
      if (currentDistance < minDistance || currentDistance > maxDistanceForRank) {
        const clampedDistance = Math.min(maxDistanceForRank, Math.max(minDistance, currentDistance));
        const nx = dx / currentDistance;
        const ny = dy / currentDistance;
        bubble.x = center + nx * clampedDistance;
        bubble.y = center + ny * clampedDistance;
        keepInSector(bubble, center, maxDistance, sectorCount);
      }
      previousDistance = Math.hypot(bubble.x - center, bubble.y - center);
      targetDistanceById[bubble.task.id] = minDistance;
    });
  });

  applyGravity(result, center, maxDistance, sectorCount, targetDistanceById, gravityById);

  resolveCollisions(result, center, maxDistance, sectorCount, mode === 'global' ? 4 : 8, 72);

  result.forEach((bubble) => {
    const dist = Math.hypot(bubble.x - center, bubble.y - center);
    bubble.distanceRatio = Math.min(1, dist / maxDistance);
  });

  return result;
}
