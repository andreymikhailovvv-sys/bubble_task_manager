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

function keepInSector(bubble: Bubble, center: number, maxDistance: number, sectorCount: number) {
  const dx = bubble.x - center;
  const dy = bubble.y - center;
  const safeMaxDistance = Math.max(0, maxDistance - bubble.radius - 12);
  let distance = Math.min(Math.hypot(dx, dy), safeMaxDistance);
  if (distance < 12) {
    distance = 12;
  }

  let angle = normalizeAngle(Math.atan2(dy, dx));
  if (sectorCount > 1) {
    const sectorStart = (Math.PI * 2 * bubble.sectorIndex) / sectorCount;
    const sectorEnd = (Math.PI * 2 * (bubble.sectorIndex + 1)) / sectorCount;
    const span = sectorEnd - sectorStart;
    const maxPadding = Math.max(0, span / 2 - 0.01);
    const dynamicPadding = Math.asin(Math.min(0.95, (bubble.radius + 14) / Math.max(distance, bubble.radius + 14)));
    const padding = Math.min(maxPadding, dynamicPadding);
    const minAngle = sectorStart + padding;
    const maxAngle = sectorEnd - padding;
    angle = Math.min(maxAngle, Math.max(minAngle, angle));
  }

  bubble.x = center + Math.cos(angle) * distance;
  bubble.y = center + Math.sin(angle) * distance;
}

function getDistanceByPriority(index: number, maxDistance: number) {
  if (index === 0) return 28;
  if (index === 1) return 50;

  const ringIndex = index - 2;
  const ring = Math.floor(ringIndex / 6);
  const slot = ringIndex % 6;
  const base = 118 + ring * 74 + slot * 10;
  return Math.min(maxDistance, base);
}

function getRadiusByPriority(index: number, proximity: number, tieBoost: number) {
  const rankScale = Math.max(0, 1 - index / 14);
  const base = 24 + rankScale * 34;
  const proximityBoost = proximity * 10;
  const tieBonus = tieBoost * 5;
  return Math.max(20, Math.min(66, base + proximityBoost + tieBonus));
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
      const key = Number.isFinite(getDueDateDiffMs(task.dueDate)) ? new Date(task.dueDate as string).toISOString().slice(0, 16) : 'none';
      const rankInDue = dueRanks[key] ?? 0;
      dueRanks[key] = rankInDue + 1;
      const sameDueCount = dueCounts[key] ?? 1;
      const importanceTieBoost = sameDueCount > 1 ? (task.importance - 1) / 4 : 0;
      const radius = getRadiusByPriority(i, proximity, importanceTieBoost);
      const distance = getDistanceByPriority(i, maxDistance);
      const angleSpan = endAngle - startAngle;
      const ringIndex = Math.max(0, i - 2);
      const angle = startAngle + (angleSpan / 7) * ((ringIndex % 6) + 1) + Math.floor(ringIndex / 6) * 0.06 - rankInDue * 0.02;
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

  for (let t = 0; t < 54; t += 1) {
    for (let i = 0; i < result.length; i += 1) {
      for (let j = i + 1; j < result.length; j += 1) {
        const a = result[i];
        const b = result[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 1;
        const minDist = a.radius + b.radius + 12;
        if (distance < minDist) {
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

  result.forEach((bubble) => {
    const dist = Math.hypot(bubble.x - center, bubble.y - center);
    bubble.distanceRatio = Math.min(1, dist / maxDistance);
  });

  return result;
}
