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
        }
      }
    }
  }

  return result;
}
