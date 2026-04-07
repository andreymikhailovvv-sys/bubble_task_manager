import type { Sphere, Task } from './types';

export type Bubble = {
  task: Task;
  x: number;
  y: number;
  radius: number;
  color: string;
  sectorIndex: number;
};

export const calcScore = (importance: number, urgency: number) => Number((importance * 0.6 + urgency * 0.4).toFixed(2));

const MOSCOW_TIMEZONE = 'Europe/Moscow';

function getMoscowNowMs() {
  const now = new Date();
  const moscowNow = new Date(now.toLocaleString('en-US', { timeZone: MOSCOW_TIMEZONE }));
  return moscowNow.getTime();
}

function getUrgencyFromDueDate(dueDate?: string | null) {
  if (!dueDate) return 0;

  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 0;

  const diffHours = (due.getTime() - getMoscowNowMs()) / 3_600_000;
  if (diffHours <= 0) return 6;
  if (diffHours <= 4) return 5;
  if (diffHours <= 12) return 4;
  if (diffHours <= 24) return 3;
  if (diffHours <= 48) return 2;
  if (diffHours <= 96) return 1;
  return 0;
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
  if (distance < bubble.radius + 14) {
    distance = bubble.radius + 14;
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

function getRadiusFromImportance(importance: number) {
  return 12 + importance * 11;
}

function getDistanceByPriority(index: number, urgency: number, importance: number, maxDistance: number) {
  const ring = Math.floor(index / 5);
  const withinRing = index % 5;
  const urgencyFactor = (6 - urgency) * 36;
  const importanceFactor = (5 - importance) * 16;
  const base = 36 + ring * 82 + withinRing * 12 + urgencyFactor + importanceFactor;
  return Math.min(maxDistance, base);
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
      const urgencyA = getUrgencyFromDueDate(a.dueDate);
      const urgencyB = getUrgencyFromDueDate(b.dueDate);
      if (urgencyA !== urgencyB) return urgencyB - urgencyA;
      if (a.importance !== b.importance) return b.importance - a.importance;
      return b.priorityScore - a.priorityScore;
    });

    sorted.forEach((task, i) => {
      const urgency = getUrgencyFromDueDate(task.dueDate);
      const radius = getRadiusFromImportance(task.importance);
      const distance = getDistanceByPriority(i, urgency, task.importance, maxDistance);
      const angleSpan = endAngle - startAngle;
      const angle = startAngle + (angleSpan / 6) * ((i % 5) + 1) + Math.floor(i / 5) * 0.1;
      const point = polarToCartesian(center, angle, distance);
      result.push({
        task,
        x: point.x,
        y: point.y,
        radius,
        color: spheres.find((s) => s.id === task.sphereId)?.color ?? '#60a5fa',
        sectorIndex
      });
    });
  });

  result.forEach((bubble) => keepInSector(bubble, center, maxDistance, sectorCount));

  for (let t = 0; t < 26; t += 1) {
    for (let i = 0; i < result.length; i += 1) {
      for (let j = i + 1; j < result.length; j += 1) {
        const a = result[i];
        const b = result[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 1;
        const minDist = a.radius + b.radius + 22;
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

  return result;
}
