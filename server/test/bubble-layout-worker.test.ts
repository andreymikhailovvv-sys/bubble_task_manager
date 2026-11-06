import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { computeBubbleLayout } from '../../client/src/lib/bubbleLayoutCompute';
import { buildSectorGeometry } from '../../client/src/lib/layout';
import { hillSectorIndexAtAngle } from '../../client/src/lib/hillSectors';
import type { Sphere, Task } from '../../client/src/lib/types';

const spheres: Sphere[] = [
  { id: 'work', name: 'Работа', color: '#ec4899' },
  { id: 'personal', name: 'Личное', color: '#22c55e' },
  { id: 'projects', name: 'Проекты', color: '#f97316' }
];
const tasks: Task[] = spheres.flatMap((sphere, sectorIndex) =>
  Array.from({ length: 5 }, (_, index) => ({
    id: `${sectorIndex}-${index}`, title: `Задача ${index}`,
    sphereId: sphere.id, importance: 5 - index, urgency: 3,
    priorityScore: 5 - index, status: 'TODO', dueDate: null,
    linkedTaskIds: index === 0 ? [`${sectorIndex}-1`] : index === 1 ? [`${sectorIndex}-0`] : []
  })));

const bounds = {
  minX: 680, maxX: 1640, minY: -60, maxY: 960,
  ellipse: { cx: 1160, cy: 450, rx: 470, ry: 492 }
};

test('worker produces packed circles in both modes with original layout semantics', () => {
  const input = { tasks, spheres, subtaskMap: {}, rankingMode: 'coefficient' as const, size: 900, bounds };
  const sector = computeBubbleLayout(input, 'sectors');
  const global = computeBubbleLayout(input, 'global');
  assert.equal(sector.bubbles.length, tasks.length);
  assert.equal(global.bubbles.length, tasks.length);
  assert.equal(sector.positions.length, tasks.length);
  assert.equal(global.positions.length, tasks.length);
  const counts = [5, 5, 5];
  const hills = buildSectorGeometry(3, counts);
  const sectorById = new Map(sector.bubbles.map((bubble) => [bubble.id, bubble.sectorIndex]));
  for (const [id, p] of sector.positions) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    const dx = (p.x - bounds.ellipse.cx) / bounds.ellipse.rx;
    const dy = (p.y - bounds.ellipse.cy) / bounds.ellipse.ry;
    const found = hillSectorIndexAtAngle(Math.atan2(dy, dx), Math.hypot(dx, dy), hills);
    assert.equal(found, sectorById.get(id), `${id} escaped its sector`);
  }
  assert.ok(sector.candidateChecks > 0);
  assert.ok(Number.isFinite(sector.initialMs));
  assert.ok(Number.isFinite(global.packingMs));
});

test('both expensive passes are absent from React rendering and run in worker', async () => {
  const field = await readFile(new URL('../../client/src/components/BubbleField.tsx', import.meta.url), 'utf8');
  const hook = await readFile(new URL('../../client/src/hooks/useBubbleLayoutWorker.ts', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../../client/src/workers/bubbleLayout.worker.ts', import.meta.url), 'utf8');
  const compute = await readFile(new URL('../../client/src/lib/bubbleLayoutCompute.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(field, /buildBubbles\(/);
  assert.doesNotMatch(field, /linkedBubblePositions\(/);
  assert.match(field, /useBubbleLayoutWorker\(/);
  assert.match(hook, /new Worker\(new URL\(/);
  assert.match(hook, /mode === 'global' \? 'sectors' : 'global'/);
  assert.match(hook, /worker\.terminate\(\)/);
  assert.match(worker, /computeBubbleLayout\(/);
  assert.match(compute, /buildBubbles\(/);
  assert.match(compute, /linkedBubblePositions\(/);
});
