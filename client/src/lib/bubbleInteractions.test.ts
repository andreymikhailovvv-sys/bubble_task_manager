import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bubbleLinkSegment, detectBubbleDrop, getLinkedBubbleGroups, linkedBubblePositions } from './bubbleInteractions';

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
  const first = result.get('a')!;
  const partner = result.get('b')!;
  assert.ok(Math.hypot(first.x - partner.x, first.y - partner.y) >= 48 + 8);
  assert.ok(Math.hypot(first.x - partner.x, first.y - partner.y) <= 48 + 21);
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
  assert.ok(Math.hypot(manual.x - neighbour.x, manual.y - neighbour.y) >= 32 + 30 + 7.9);
  assert.ok(Math.hypot(manual.x - 100, manual.y - 100) < 1);
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
  assert.ok(Math.hypot(partner.x - anchor.x, partner.y - anchor.y) >= 26 + 24 + 8);
  assert.ok(Math.hypot(partner.x - anchor.x, partner.y - anchor.y) <= 26 + 24 + 25);
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

test('five interconnected tasks form one component with four retained edges', () => {
  const circles = [
    { id: 'root', x: 300, y: 300, radius: 44, linkedTaskIds: ['a','b','c','d'], bubbleLinkAnchorId: 'root', pinned: true },
    { id: 'a', x: 50, y: 100, radius: 28, linkedTaskIds: ['root'], bubbleLinkAnchorId: 'root' },
    { id: 'b', x: 530, y: 500, radius: 36, linkedTaskIds: ['root'], bubbleLinkAnchorId: 'root' },
    { id: 'c', x: 80, y: 400, radius: 22, linkedTaskIds: ['root'], bubbleLinkAnchorId: 'root' },
    { id: 'd', x: 550, y: 170, radius: 25, linkedTaskIds: ['root'], bubbleLinkAnchorId: 'root' },
    { id: 'other', x: 600, y: 600, radius: 22 }
  ];
  const groups = getLinkedBubbleGroups(circles);
  assert.equal(groups.length, 2);
  const connected = groups.find((group) => group.ids.includes('root'))!;
  assert.equal(connected.anchorId, 'root');
  assert.equal(connected.ids.length, 5);
  assert.equal(connected.edges.length, 4);
  const positions = linkedBubblePositions(circles, { minX: 0, minY: 0, maxX: 700, maxY: 700 });
  for (let i = 0; i < circles.length; i++) {
    for (let j = i+1; j < circles.length; j++) {
      const left = circles[i], right = circles[j];
      const a = positions.get(left.id)!, b = positions.get(right.id)!;
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= left.radius + right.radius + 8,
        `Overlap: ${left.id}, ${right.id}`);
    }
  }
});

test('linked components merge correctly through a chain, not only a star', () => {
  const bubbles = [
    { id: 'a', x: 180, y: 180, radius: 40, linkedTaskIds: ['b'], bubbleLinkAnchorId: 'b' },
    { id: 'b', x: 300, y: 180, radius: 38, linkedTaskIds: ['a', 'c'], bubbleLinkAnchorId: 'b' },
    { id: 'c', x: 420, y: 180, radius: 36, linkedTaskIds: ['b', 'd'], bubbleLinkAnchorId: 'b' },
    { id: 'd', x: 540, y: 180, radius: 33, linkedTaskIds: ['c'], bubbleLinkAnchorId: 'b' }
  ];
  const groups = getLinkedBubbleGroups(bubbles);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].anchorId, 'b');
  assert.equal(groups[0].edges.length, 3);
  const positions = linkedBubblePositions(bubbles, { minX: 0, minY: 0, maxX: 800, maxY: 700 });
  for (const id of groups[0].ids) assert.ok(positions.has(id));
});

test('connector is short and starts just inside the bubble rims', () => {
  const edge = bubbleLinkSegment({ x: 100, y: 100 }, { x: 200, y: 100 }, 30, 25);
  assert.deepEqual(edge, { x1: 128, y1: 100, x2: 177, y2: 100 });
});

test('largest linked task becomes the visual gravitational centre', () => {
  const field = { minX: 0, maxX: 800, minY: 0, maxY: 800,
    compact: true, ellipse: { cx: 400, cy: 400, rx: 380, ry: 365 } };
  const circles = [
    { id: 'small', x: 650, y: 630, radius: 23, linkedTaskIds: ['large'], bubbleLinkAnchorId: 'small' },
    { id: 'large', x: 630, y: 595, radius: 96, linkedTaskIds: ['small'], bubbleLinkAnchorId: 'small' }
  ];
  const positions = linkedBubblePositions(circles, field);
  const biggest = positions.get('large')!;
  const small = positions.get('small')!;
  const initialDistance = Math.hypot((630 - 400) / 380, (595 - 400) / 365);
  const movedDistance = Math.hypot((biggest.x - 400) / 380, (biggest.y - 400) / 365);
  assert.ok(movedDistance < initialDistance * 0.75, 'large task moves toward shared centre');
  assert.ok(Math.hypot(biggest.x - small.x, biggest.y - small.y) >= 96 + 23 + 14);
});

test('manual coordinates override centre-seeking for linked tasks', () => {
  const field = { minX: 0, maxX: 800, minY: 0, maxY: 800,
    ellipse: { cx: 400, cy: 400, rx: 380, ry: 365 } };
  const circles = [
    { id: 'manual', x: 590, y: 460, radius: 25, pinned: true, linkedTaskIds: ['large'], bubbleLinkAnchorId: 'manual' },
    { id: 'large', x: 700, y: 460, radius: 90, linkedTaskIds: ['manual'], bubbleLinkAnchorId: 'manual' }
  ];
  const positions = linkedBubblePositions(circles, field);
  const manual = positions.get('manual')!;
  const large = positions.get('large')!;
  assert.ok(Math.hypot(manual.x - 590, manual.y - 460) < 1,
    'explicitly positioned task is not pulled to the centre');
  assert.ok(Math.hypot(manual.x - large.x, manual.y - large.y) >= 25 + 90 + 14);
});

test('two large bubbles detect a link before their rims collide', () => {
  const targets = [{ id: 'large', x: 220, y: 100, radius: 92 }];
  const intent = detectBubbleDrop({ x: 18, y: 100 }, 'source', 90, targets);
  assert.deepEqual(intent, { targetId: 'large', kind: 'link' });
});

test('strict sector boundaries and no collisions apply to linked and unlinked tasks', () => {
  const bounds = {
    minX: -460, maxX: 460, minY: -450, maxY: 450,
    compact: true,
    ellipse: { cx: 0, cy: 0, rx: 450, ry: 440 },
    sectors: [
      { start: { x: 1, y: 0 }, end: { x: -1, y: 0 } },
      { start: { x: -1, y: 0 }, end: { x: 1, y: 0 } }
    ]
  };
  const bubbles = [
    { id: 'a', x: -230, y: -85, radius: 92, sectorIndex: 0,
      linkedTaskIds: ['b', 'c'], bubbleLinkAnchorId: 'a' },
    { id: 'b', x: -140, y: -50, radius: 58, sectorIndex: 0,
      linkedTaskIds: ['a'], bubbleLinkAnchorId: 'a' },
    { id: 'c', x: -20, y: -50, radius: 44, sectorIndex: 0,
      linkedTaskIds: ['a'], bubbleLinkAnchorId: 'a' },
    { id: 'd', x: 60, y: 30, radius: 50, sectorIndex: 0 },
    { id: 'e', x: 160, y: 10, radius: 28, sectorIndex: 0 },
    { id: 'f', x: -120, y: 80, radius: 75, sectorIndex: 1 },
    { id: 'g', x: 50, y: 40, radius: 52, sectorIndex: 1,
      linkedTaskIds: ['h'], bubbleLinkAnchorId: 'g' },
    { id: 'h', x: 80, y: 10, radius: 38, sectorIndex: 1,
      linkedTaskIds: ['g'], bubbleLinkAnchorId: 'g' }
  ];
  const points = linkedBubblePositions(bubbles, bounds);
  for (const bubble of bubbles) {
    const p = points.get(bubble.id)!;
    assert.ok(p, `Missing bubble ${bubble.id}`);
    if (bubble.sectorIndex === 0) {
      assert.ok(p.y >= bubble.radius + 4, `${bubble.id} crossed upper sector boundary`);
    } else {
      assert.ok(p.y <= -bubble.radius - 4, `${bubble.id} crossed lower sector boundary`);
    }
    assert.ok(Math.hypot(p.x / (450 - bubble.radius - 3), p.y / (440 - bubble.radius - 3)) <= 1.001,
      `${bubble.id} left ellipse`);
  }
  for (let i = 0; i < bubbles.length; i++) {
    for (let j = i+1; j < bubbles.length; j++) {
      const a = bubbles[i], b = bubbles[j];
      const x = points.get(a.id)!, y = points.get(b.id)!;
      assert.ok(Math.hypot(x.x - y.x, x.y - y.y) >= a.radius + b.radius + 7.9,
        `Collision of ${a.id} and ${b.id}`);
    }
  }
});

test('packing draws even unlinked global tasks inward without new overlaps', () => {
  const bubbles = [
    { id: 'big', x: 330, y: 40, radius: 85 },
    { id: 'medium', x: -280, y: 140, radius: 55 },
    { id: 'small', x: 130, y: -300, radius: 28 },
    { id: 'tiny', x: -310, y: -270, radius: 22 }
  ];
  const bounds = { minX: -420, maxX: 420, minY: -420, maxY: 420,
    compact: true, ellipse: { cx: 0, cy: 0, rx: 405, ry: 405 } };
  const points = linkedBubblePositions(bubbles, bounds);
  const originalAvg = bubbles.reduce((total, p) => total + Math.hypot(p.x, p.y), 0) / bubbles.length;
  const packedAvg = bubbles.reduce((total, p) => {
    const v = points.get(p.id)!;
    return total + Math.hypot(v.x, v.y);
  }, 0) / bubbles.length;
  assert.ok(packedAvg < originalAvg * 0.67, 'loose arrangement must compact');
  for (let i = 0; i < bubbles.length; i++) {
    for (let j = i+1; j < bubbles.length; j++) {
      const x = points.get(bubbles[i].id)!, y = points.get(bubbles[j].id)!;
      assert.ok(Math.hypot(x.x - y.x, x.y - y.y) >= bubbles[i].radius + bubbles[j].radius + 7.9);
    }
  }
});

test('a linked group cannot override collision or boundary protection', () => {
  const bounds = { minX: -450, maxX: 450, minY: -450, maxY: 450,
    compact: true, ellipse: { cx: 0, cy: 0, rx: 450, ry: 450 },
    sectors: [
      { start: { x: 1, y: 0 }, end: { x: -1, y: 0 } },
      { start: { x: -1, y: 0 }, end: { x: 1, y: 0 } }
    ]
  };
  const bubbles = [
    { id: 'anchor', x: -150, y: 50, radius: 100, sectorIndex: 0,
      linkedTaskIds: ['buddy'], bubbleLinkAnchorId: 'anchor' },
    { id: 'buddy', x: -120, y: 80, radius: 72, sectorIndex: 0,
      linkedTaskIds: ['anchor'], bubbleLinkAnchorId: 'anchor' },
    { id: 'neighbour', x: -145, y: 72, radius: 90, sectorIndex: 0 },
    { id: 'other-sector', x: -145, y: 72, radius: 92, sectorIndex: 1 }
  ];
  const points = linkedBubblePositions(bubbles, bounds);
  for (const b of bubbles) {
    const p = points.get(b.id)!;
    assert.ok(b.sectorIndex === 0 ? p.y > b.radius : p.y < -b.radius);
  }
  for (let i = 0; i < bubbles.length; i++) for (let j = i+1; j < bubbles.length; j++) {
    const a = points.get(bubbles[i].id)!, b = points.get(bubbles[j].id)!;
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= bubbles[i].radius + bubbles[j].radius + 7.9);
  }
});

test('dense three-sector workspace never crosses a divider or overlaps a linked group', () => {
  const rays = [0, 2 * Math.PI / 3, 4 * Math.PI / 3, 2 * Math.PI];
  const bounds = {
    minX: -460, maxX: 460, minY: -460, maxY: 460, compact: true,
    ellipse: { cx: 0, cy: 0, rx: 440, ry: 440 },
    sectors: [0, 1, 2].map((index) => ({
      start: { x: Math.cos(rays[index]), y: Math.sin(rays[index]) },
      end: { x: Math.cos(rays[index + 1]), y: Math.sin(rays[index + 1]) }
    }))
  };
  const bubbles = [0, 1, 2].flatMap((sectorIndex) =>
    Array.from({ length: 16 }, (_, i) => {
      const angle = rays[sectorIndex] + (rays[sectorIndex + 1] - rays[sectorIndex]) * (i % 5 + 1) / 6;
      const id = `s${sectorIndex}-${i}`;
      const linkedTaskIds = i < 5
        ? [i > 0 ? `s${sectorIndex}-${i-1}` : '', i < 4 ? `s${sectorIndex}-${i+1}` : ''].filter(Boolean)
        : [];
      return {
        id, sectorIndex, radius: 18 + (i * 13 + sectorIndex * 7) % 42,
        x: Math.cos(angle) * (280 + (i * 17) % 105),
        y: Math.sin(angle) * (280 + (i * 17) % 105),
        linkedTaskIds, bubbleLinkAnchorId: `s${sectorIndex}-0`
      };
    })
  );
  const points = linkedBubblePositions(bubbles, bounds);
  for (const bubble of bubbles) {
    const p = points.get(bubble.id)!;
    const angle = rays[bubble.sectorIndex];
    const endAngle = rays[bubble.sectorIndex + 1];
    const n1 = { x: -Math.sin(angle), y: Math.cos(angle) };
    const n2 = { x: Math.sin(endAngle), y: -Math.cos(endAngle) };
    assert.ok(p.x * n1.x + p.y * n1.y >= bubble.radius + 4,
      `${bubble.id} crossed sector's first boundary`);
    assert.ok(p.x * n2.x + p.y * n2.y >= bubble.radius + 4,
      `${bubble.id} crossed sector's second boundary`);
    assert.ok(Math.hypot(p.x / (440 - bubble.radius - 3), p.y / (440 - bubble.radius - 3)) <= 1.001,
      `${bubble.id} outside field`);
  }
  for (let i = 0; i < bubbles.length; i++) for (let j = i + 1; j < bubbles.length; j++) {
    const a = points.get(bubbles[i].id)!, b = points.get(bubbles[j].id)!;
    assert.ok(Math.hypot(a.x-b.x, a.y-b.y) >= bubbles[i].radius + bubbles[j].radius + 7.9,
      `Overlap of ${bubbles[i].id} and ${bubbles[j].id}`);
  }
});

test('each sector forms a high-coefficient inner nucleus without breaking boundaries', () => {
  const bounds = {
    minX: -480, maxX: 480, minY: -480, maxY: 480,
    compact: true,
    ellipse: { cx: 0, cy: 0, rx: 460, ry: 460 },
    sectors: [
      { start: { x: 1, y: 0 }, end: { x: -1, y: 0 } },
      { start: { x: -1, y: 0 }, end: { x: 1, y: 0 } }
    ]
  };
  const bubbles = [0, 1].flatMap((sectorIndex) =>
    [0.96, 0.89, 0.78, 0.2, 0.12].map((coefficient, idx) => ({
      id: `sector-${sectorIndex}-${idx}`,
      x: (idx - 2) * 65,
      y: (sectorIndex === 0 ? 1 : -1) * (250 + idx * 9),
      radius: idx < 3 ? 46 - idx * 5 : 27,
      sectorIndex, coefficient
    }))
  );
  const positions = linkedBubblePositions(bubbles, bounds);
  for (let sectorIndex = 0; sectorIndex < 2; sectorIndex++) {
    const tasks = bubbles.filter((bubble) => bubble.sectorIndex === sectorIndex);
    const high = tasks.filter((bubble) => bubble.coefficient >= 0.78);
    const low = tasks.filter((bubble) => bubble.coefficient < 0.3);
    const averageRadius = (items: typeof tasks) =>
      items.reduce((sum, bubble) => {
        const p = positions.get(bubble.id)!;
        return sum + Math.hypot(p.x, p.y);
      }, 0) / items.length;
    assert.ok(averageRadius(high) < averageRadius(low),
      `Sector ${sectorIndex} high-coefficient nucleus was not closer to centre`);
    for (const bubble of tasks) {
      const point = positions.get(bubble.id)!;
      assert.ok(sectorIndex === 0 ? point.y >= bubble.radius + 9 : point.y <= -bubble.radius - 9,
        `${bubble.id} crossed sector wall`);
    }
  }
  for (let i = 0; i < bubbles.length; i++) {
    for (let j = i + 1; j < bubbles.length; j++) {
      const a = bubbles[i], b = bubbles[j];
      const pa = positions.get(a.id)!, pb = positions.get(b.id)!;
      assert.ok(Math.hypot(pa.x - pb.x, pa.y - pb.y) >= a.radius + b.radius + 12.9,
        `Collision ${a.id}/${b.id}`);
    }
  }
});

test('relative sector core packs multiple medium-coefficient tasks ahead of a large low-coefficient circle', () => {
  const bounds = {
    minX: -480, maxX: 480, minY: -480, maxY: 480,
    compact: true,
    ellipse: { cx: 0, cy: 0, rx: 460, ry: 460 },
    sectors: [
      { start: { x: 1, y: 0 }, end: { x: -1, y: 0 } },
      { start: { x: -1, y: 0 }, end: { x: 1, y: 0 } }
    ]
  };
  const bubbles = [0, 1].flatMap((sectorIndex) =>
    [0.54, 0.50, 0.45, 0.28, 0.22, 0.15].map((coefficient, index) => ({
      id: `tier-${sectorIndex}-${index}`,
      x: 330 - index * 118,
      y: (sectorIndex === 0 ? 1 : -1) * (285 + (index % 3) * 25),
      radius: index === 3 ? 77 : index < 3 ? 34 : 26,
      coefficient,
      sectorIndex
    }))
  );
  const positions = linkedBubblePositions(bubbles, bounds);
  for (const sectorIndex of [0, 1]) {
    const selected = bubbles.filter((bubble) => bubble.sectorIndex === sectorIndex);
    const core = selected.slice(0, 2);
    const low = selected.slice(2);
    const gap = Math.hypot(
      positions.get(core[0].id)!.x - positions.get(core[1].id)!.x,
      positions.get(core[0].id)!.y - positions.get(core[1].id)!.y
    ) - core[0].radius - core[1].radius;
    assert.ok(gap < 54, `High-coefficient pair is scattered in sector ${sectorIndex}: gap=${gap}`);
    const radial = (bubble: typeof selected[number]) => {
      const p = positions.get(bubble.id)!;
      return Math.hypot(p.x, p.y);
    };
    assert.ok(Math.max(...core.map(radial)) < Math.max(...low.map(radial)),
      `Core must occupy the inner portion of sector ${sectorIndex}`);
    for (const bubble of selected) {
      const point = positions.get(bubble.id)!;
      assert.ok(sectorIndex === 0 ? point.y >= bubble.radius + 9 : point.y <= -bubble.radius - 9,
        `${bubble.id} violates its sector wall`);
    }
  }
  for (let i = 0; i < bubbles.length; i++) for (let j = i + 1; j < bubbles.length; j++) {
    const a = bubbles[i], b = bubbles[j];
    const pa = positions.get(a.id)!, pb = positions.get(b.id)!;
    assert.ok(Math.hypot(pa.x - pb.x, pa.y - pb.y) >= a.radius + b.radius + 12.9,
      `Core packing caused collision: ${a.id}, ${b.id}`);
  }
});
