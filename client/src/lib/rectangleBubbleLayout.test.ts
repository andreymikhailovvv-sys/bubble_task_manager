import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutRectangleBubbles } from './rectangleBubbleLayout';
import type { Bubble } from './layout';

const rectangle = { left: 0, top: 0, right: 1840, bottom: 860 };
const center = { x: 920, y: 430 };
const bubble = (index: number, sectorIndex: number, radius: number): Bubble => ({
  task: { id: `task-${index}`, title: `Task ${index}`, importance: 3, urgency: 3, priorityScore: 3 },
  x: 450,
  y: 450,
  radius,
  sectorIndex,
  color: '#99aaff',
  distanceRatio: 0.5
});

function validatePackedBubbles(source: Bubble[], sectorCount: number) {
  const layout = layoutRectangleBubbles(source, sectorCount, rectangle);
  assert.equal(layout.bubbles.length, source.length);
  assert.equal(layout.geometry.length, sectorCount);
  assert.equal(layout.bubbles.filter((b) => b.radius <= 1.5).length, 0, 'packing fell back to microscopic/overlapping positions');

  layout.bubbles.forEach((a, i) => {
    assert.ok(a.x - a.radius >= rectangle.left - 0.01, `${a.task.id} crosses left`);
    assert.ok(a.x + a.radius <= rectangle.right + 0.01, `${a.task.id} crosses right`);
    assert.ok(a.y - a.radius >= rectangle.top - 0.01, `${a.task.id} crosses top`);
    assert.ok(a.y + a.radius <= rectangle.bottom + 0.01, `${a.task.id} crosses bottom`);
    if (sectorCount > 1) {
      const sector = layout.geometry[a.sectorIndex];
      const start = layout.rotation + sector.startAngle;
      const end = layout.rotation + sector.endAngle;
      const dx = a.x - center.x;
      const dy = a.y - center.y;
      const sideStart = Math.sin(start) * dx - Math.cos(start) * dy;
      const sideEnd = Math.sin(end) * dx - Math.cos(end) * dy;
      assert.ok(sideStart <= -a.radius + 0.01, `${a.task.id} crosses sector starting ray`);
      assert.ok(sideEnd >= a.radius - 0.01, `${a.task.id} crosses sector ending ray`);
    }
    for (let j = i + 1; j < layout.bubbles.length; j += 1) {
      const b = layout.bubbles[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.radius + b.radius - 0.01,
        `Tasks ${a.task.id} and ${b.task.id} overlap`);
    }
  });
  return layout;
}

test('three uneven sectors use the rectangular stage without crossing rays or overlapping', () => {
  const source = [
    ...Array.from({ length: 38 }, (_, i) => bubble(i, 0, i < 5 ? 114 - i * 10 : 19 + (i % 6) * 7)),
    ...Array.from({ length: 13 }, (_, i) => bubble(i + 38, 1, i < 3 ? 125 - i * 20 : 21 + (i % 5) * 10)),
    ...Array.from({ length: 19 }, (_, i) => bubble(i + 51, 2, i < 4 ? 130 - i * 15 : 22 + (i % 5) * 8))
  ];
  const layout = validatePackedBubbles(source, 3);
  assert.ok(layout.geometry[0].span > layout.geometry[1].span * 0.6, 'most populated sector should have meaningful space');
});

test('unpartitioned rectangular stage packs tasks without collisions', () => {
  const source = Array.from({ length: 65 }, (_, i) =>
    bubble(i, 0, i < 7 ? 128 - i * 8 : 20 + (i % 7) * 9));
  validatePackedBubbles(source, 1);
});

test('small and empty sectors remain operable', () => {
  const source = Array.from({ length: 25 }, (_, i) => bubble(i, 0, i < 3 ? 120 : 24));
  validatePackedBubbles(source, 4);
});
