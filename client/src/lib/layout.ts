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
  const safeMaxDistance = Math.max(0, maxDistance - bubble.radius - 6);
  let distance = Math.min(Math.hypot(dx, dy), safeMaxDistance);
  if (distance < bubble.radius + 8) {
    distance = bubble.radius + 8;
  }

  let angle = normalizeAngle(Math.atan2(dy, dx));
  if (sectorCount > 1) {
    const sectorStart = (Math.PI * 2 * bubble.sectorIndex) / sectorCount;
    const sectorEnd = (Math.PI * 2 * (bubble.sectorIndex + 1)) / sectorCount;
    const span = sectorEnd - sectorStart;
    const maxPadding = Math.max(0, span / 2 - 0.01);
    const dynamicPadding = Math.asin(Math.min(0.95, (bubble.radius + 6) / Math.max(distance, bubble.radius + 8)));
    const padding = Math.min(maxPadding, dynamicPadding);
    const minAngle = sectorStart + padding;
    const maxAngle = sectorEnd - padding;
    angle = Math.min(maxAngle, Math.max(minAngle, angle));
  }

  bubble.x = center + Math.cos(angle) * distance;
  bubble.y = center + Math.sin(angle) * distance;
}

export function buildBubbles(tasks: Task[], spheres: Sphere[], mode: 'global' | 'sectors', size: number): Bubble[] {
  const center = size / 2;
  const maxDistance = size * 0.42;
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
    const sorted = [...sectorTasks].sort((a, b) => b.priorityScore - a.priorityScore);

    sorted.forEach((task, i) => {
      const radius = 18 + task.priorityScore * 7;
      const ring = Math.floor(i / 6);
      const withinRing = i % 6;
      const ringDistance = Math.min(maxDistance, 45 + ring * 65 + (5 - task.priorityScore) * 12);
      const angleSpan = endAngle - startAngle;
      const angle = startAngle + (angleSpan / 7) * (withinRing + 1) + ring * 0.12;
      const point = polarToCartesian(center, angle, ringDistance);
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

  for (let t = 0; t < 20; t += 1) {
    for (let i = 0; i < result.length; i += 1) {
      for (let j = i + 1; j < result.length; j += 1) {
        const a = result[i];
        const b = result[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 1;
        const minDist = a.radius + b.radius + 8;
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
