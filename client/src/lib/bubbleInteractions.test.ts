import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectBubbleDrop, linkedBubblePositions } from './bubbleInteractions';

test('near rim links; deep inside nests; outside does nothing', () => {
  const bubbles = [{ id: 'a', x: 50, y: 50, radius: 40 }, { id: 'b', x: 170, y: 50, radius: 35 }];
  assert.deepEqual(detectBubbleDrop({ x: 124, y: 50 }, 'a', 40, bubbles), { targetId: 'b', kind: 'link' });
  assert.deepEqual(detectBubbleDrop({ x: 170, y: 50 }, 'a', 40, bubbles), { targetId: 'b', kind: 'nest' });
  assert.equal(detectBubbleDrop({ x: 70, y: 180 }, 'a', 40, bubbles), null);
});
test('linked pair magnetizes and does not move unrelated bubbles', () => {
  const bubbles = [
    { id: 'a', x: 100, y: 100, radius: 24, linkedTaskIds: ['b'], bubbleLinkAnchorId: 'a' },
    { id: 'b', x: 300, y: 100, radius: 24, linkedTaskIds: ['a'], bubbleLinkAnchorId: 'a' },
    { id: 'c', x: 360, y: 260, radius: 20 }
  ];
  const result = linkedBubblePositions(bubbles, { minX: 0, maxX: 500, minY: 0, maxY: 500 });
  assert.deepEqual(result.get('b'), { x: 160, y: 100 });
  assert.deepEqual(result.get('c'), { x: 360, y: 260 });
});

test('automatic positions remain unchanged when no user placements or links exist', () => {
  const bubbles = [
    { id: 'a', x: 100, y: 130, radius: 25 },
    { id: 'b', x: 300, y: 230, radius: 40 }
  ];
  const result = linkedBubblePositions(bubbles, { minX: 0, maxX: 500, minY: 0, maxY: 500 });
  assert.deepEqual(result.get('a'), { x: 100, y: 130 });
  assert.deepEqual(result.get('b'), { x: 300, y: 230 });
});

test('saved manual position repels only overlapping neighbours', () => {
  const bubbles = [
    { id: 'manual', x: 100, y: 100, radius: 32, pinned: true },
    { id: 'neighbour', x: 105, y: 100, radius: 30 },
    { id: 'untouched', x: 370, y: 240, radius: 24 }
  ];
  const positions = linkedBubblePositions(bubbles, { minX: 0, maxX: 550, minY: 0, maxY: 500 });
  const manual = positions.get('manual')!;
  const neighbour = positions.get('neighbour')!;
  assert.ok(Math.hypot(manual.x - neighbour.x, manual.y - neighbour.y) > 65);
  assert.ok(Math.abs(manual.x - 100) < Math.abs(neighbour.x - 105));
  assert.deepEqual(positions.get('untouched'), { x: 370, y: 240 });
});

test('a magnetic pair repels an intruding bubble without breaking the bond', () => {
  const bubbles = [
    { id: 'anchor', x: 160, y: 160, radius: 26, linkedTaskIds: ['satellite'], bubbleLinkAnchorId: 'anchor', pinned: true },
    { id: 'satellite', x: 320, y: 160, radius: 24, linkedTaskIds: ['anchor'], bubbleLinkAnchorId: 'anchor' },
    { id: 'intruder', x: 217, y: 160, radius: 28 },
    { id: 'distant', x: 490, y: 450, radius: 20 }
  ];
  const positions = linkedBubblePositions(bubbles, { minX: 0, maxX: 700, minY: 0, maxY: 700 });
  const anchor = positions.get('anchor')!;
  const partner = positions.get('satellite')!;
  const intruder = positions.get('intruder')!;
  assert.ok(Math.abs(Math.hypot(partner.x - anchor.x, partner.y - anchor.y) - 62) < 0.1);
  assert.ok(Math.hypot(intruder.x - partner.x, intruder.y - partner.y) > 56);
  assert.deepEqual(positions.get('distant'), { x: 490, y: 450 });
});

test('user placements are confined inside the oval viewport', () => {
  const bounds = {
    minX: -200, maxX: 200, minY: -200, maxY: 200,
    ellipse: { cx: 0, cy: 0, rx: 150, ry: 110 }
  };
  const bubbles = [{ id: 'manual', x: 195, y: 170, radius: 24, pinned: true }];
  const result = linkedBubblePositions(bubbles, bounds).get('manual')!;
  const norm = Math.hypot(result.x / (150 - 29), result.y / (110 - 29));
  assert.ok(norm <= 1.001);
});
