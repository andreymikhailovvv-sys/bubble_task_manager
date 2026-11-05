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
    { id: 'a', x: 100, y: 100, radius: 24, linkedTaskIds: ['b'] },
    { id: 'b', x: 300, y: 100, radius: 24, linkedTaskIds: ['a'] },
    { id: 'c', x: 360, y: 260, radius: 20 }
  ];
  const result = linkedBubblePositions(bubbles, { minX: 0, maxX: 500, minY: 0, maxY: 500 });
  assert.deepEqual(result.get('b'), { x: 160, y: 100 });
  assert.deepEqual(result.get('c'), { x: 360, y: 260 });
});
