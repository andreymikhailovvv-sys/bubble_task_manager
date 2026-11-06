import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildBubbles, buildSectorGeometry, getBubbleSectorSpheres, getTaskCoefficient } from '../../client/src/lib/layout';
import { hillBoundaryAngle, hillBoundaryCurve, hillSectorIndexAtAngle, hillSectorAnglesAtRadius } from '../../client/src/lib/hillSectors';
import { linkedBubblePositions } from '../../client/src/lib/bubbleInteractions';
import type { Sphere, Task } from '../../client/src/lib/types';

const spheres: Sphere[] = [
  { id: 'work', name: 'Работа', color: '#ec4899' },
  { id: 'personal', name: 'Личное', color: '#22c55e' },
  { id: 'projects', name: 'Проекты', color: '#f97316' }
];
const task = (id: string, sphereId: string, importance: number): Task => ({
  id, title: id, sphereId, importance, urgency: 3, priorityScore: importance * 0.6 + 1.2,
  status: 'TODO', dueDate: null
});
const tasks = spheres.flatMap(sphere => [5, 3, 1].map((importance, i) =>
  task(`${sphere.id}-${i}`, sphere.id, importance)));

test('three hill regions follow the upper-right, bottom, upper-left sketch', () => {
  const geometry = buildSectorGeometry(3, [3, 3, 3]);
  assert.equal(geometry.length, 3);
  assert.ok(Math.abs(geometry[0].startAngle + Math.PI / 2) < 1e-8);
  assert.ok(geometry[0].midAngle < 0 && geometry[0].midAngle > -Math.PI / 2);
  assert.ok(geometry[1].midAngle > 0 && geometry[1].midAngle < Math.PI);
  assert.ok(geometry[2].midAngle > Math.PI && geometry[2].midAngle < 3 * Math.PI / 2);
  assert.equal(getBubbleSectorSpheres(tasks, spheres, 'sectors').length, 3);
});

test('shared hill walls are curved, continuous, gap-free and reversible at the rim', () => {
  const geometry = buildSectorGeometry(3, [3, 6, 2]);
  for (let index = 0; index < geometry.length; index += 1) {
    const original = geometry[index].startAngle;
    const curve = hillBoundaryCurve(geometry, index);
    assert.ok(Math.abs(hillBoundaryAngle(geometry, index, 1) - original) < 1e-8);
    assert.ok(Math.abs(hillBoundaryAngle(geometry, index, 0) -
      (original + Math.atan2(2 * curve.bow, 1))) < 1e-8);
    assert.ok(Math.abs(hillBoundaryAngle(geometry, index, 0.5) - original) > 0.01,
      `sector ${index} should use a visible quadratic, not a straight divider`);
    // Sample the rendered quadratic in normalized ellipse coordinates, then
    // verify that hit-testing resolves precisely to the same Bézier.
    for (const t of [0.08, 0.2, 0.45, 0.7, 0.95]) {
      const x = 2 * (1 - t) * t * curve.control.x + t * t * curve.end.x;
      const y = 2 * (1 - t) * t * curve.control.y + t * t * curve.end.y;
      const angle = Math.atan2(y, x);
      const boundaryAngle = hillBoundaryAngle(geometry, index, Math.hypot(x, y));
      const diff = Math.atan2(Math.sin(angle - boundaryAngle), Math.cos(angle - boundaryAngle));
      assert.ok(Math.abs(diff) < 0.00002, `render/hit mismatch for ${index} at ${t}: ${diff}`);
    }
  }
  for (const ratio of [0, 0.1, 0.25, 0.5, 0.85, 1]) {
    const angles = geometry.map((_, i) => hillSectorAnglesAtRadius(geometry, i, ratio));
    const sum = angles.reduce((total, item) => total + item.span, 0);
    assert.ok(Math.abs(sum - Math.PI * 2) < 1e-8);
    for (let i = 0; i < 360; i++) {
      const angle = -Math.PI + i * Math.PI / 180;
      const found = hillSectorIndexAtAngle(angle, ratio, geometry);
      assert.ok(found >= 0 && found < geometry.length);
    }
  }
});

test('sector bubbles retain assignment, priority coefficient and manually saved positions', () => {
  const pinned = { ...tasks[0], bubbleSectorX: 235, bubbleSectorY: 270 };
  const input = [pinned, ...tasks.slice(1)];
  const bubbles = buildBubbles(input, spheres, 'sectors', 900, 'coefficient');
  assert.equal(bubbles.length, input.length);
  assert.equal(bubbles[0].task.sphereId, 'work');
  for (const bubble of bubbles) {
    assert.ok(Number.isFinite(bubble.x) && Number.isFinite(bubble.y));
    assert.ok(bubble.radius > 0);
    assert.equal(bubble.sectorIndex, spheres.findIndex(sphere => sphere.id === bubble.task.sphereId));
  }
  const saved = bubbles.find(bubble => bubble.task.id === pinned.id);
  assert.equal(saved?.x, 235);
  assert.equal(saved?.y, 270);
  assert.ok(getTaskCoefficient(input[0]) > getTaskCoefficient(input[2]));
});

test('curved-sector packer keeps bubbles in their hill and leaves link positions finite', () => {
  const geometry = buildSectorGeometry(3, [3, 3, 3]);
  const bubbles = buildBubbles(tasks, spheres, 'sectors', 900, 'coefficient');
  const visuals = bubbles.map(bubble => ({
    id: bubble.task.id,
    x: 450 + (bubble.x - 450),
    y: 450 + (bubble.y - 450),
    radius: Math.min(46, bubble.radius * 0.6),
    sectorIndex: bubble.sectorIndex,
    coefficient: getTaskCoefficient(bubble.task)
  }));
  const placed = linkedBubblePositions(visuals, {
    minX: 15, maxX: 885, minY: 15, maxY: 885,
    ellipse: { cx: 450, cy: 450, rx: 425, ry: 425 },
    hillSectors: geometry,
    compact: true
  });
  assert.equal(placed.size, visuals.length);
  for (const bubble of visuals) {
    const position = placed.get(bubble.id)!;
    assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y));
    const dx = (position.x - 450) / 425;
    const dy = (position.y - 450) / 425;
    assert.equal(hillSectorIndexAtAngle(Math.atan2(dy, dx), Math.hypot(dx, dy), geometry), bubble.sectorIndex);
  }
});

test('the same hill SVG and drag/drop geometry render in regular and fullscreen bubbles', async () => {
  const src = await readFile(new URL('../../client/src/components/BubbleField.tsx', import.meta.url), 'utf8');
  assert.match(src, /const hillBoundaryPath =/);
  assert.match(src, /const hillRegionPath =/);
  assert.match(src, /hillSectorIndexAtAngle\(/);
  assert.match(src, /hillSectors: mode === 'sectors'/);
  assert.match(src, /d=\{hillBoundaryPath\(idx\)\}/);
  assert.match(src, /Q \${control\.x\.toFixed\(2\)\}/);
  assert.doesNotMatch(src, /strokeWidth=\{11\}|hill-ridge-/);
  assert.match(src, /d=\{hillRegionPath\(dragView\.destinationSectorIndex\)\}/);
  assert.match(src, /fullscreen = false/);
  assert.match(src, /petal-sector-gradient-/);
  assert.match(src, /fill=\{\`url\(#petal-sector-gradient-\$\{idx\}\)\`\}/);
  assert.match(src, /r=\{9\}/);
  assert.match(src, /fillOpacity=\{isLightTheme \? 0\.95 : 0\.91\}/);
  assert.match(src, /stroke=\{isLightTheme \? '#7293a8' : '#a5b7ca'\}/);
  assert.match(src, /rounded-full border px-3 py-1\.5 text-sm font-semibold/);
  assert.doesNotMatch(src, /<line key=\{idx\} className="sector-divider"/);
  assert.doesNotMatch(src, /key=\{\`hill-wall-\$\{idx\}\`\} className="sector-divider"/);
});

test('pastel petal sectors adapt to imbalanced counts and multiple sector numbers', () => {
  const scenarios = [
    [2, [1, 20]],
    [3, [2, 5, 40]],
    [3, [35, 1, 3]],
    [4, [1, 6, 40, 2]],
    [5, [1, 10, 2, 16, 3]]
  ] as const;
  for (const [sectorCount, counts] of scenarios) {
    const geometry = buildSectorGeometry(sectorCount, [...counts]);
    assert.equal(geometry.length, sectorCount);
    assert.ok(Math.abs(geometry.reduce((sum, sector) => sum + sector.span, 0) - 2 * Math.PI) < 0.000001);
    for (const radius of [0, 0.08, 0.2, 0.4, 0.72, 0.95, 1]) {
      const sections = geometry.map((_, i) => hillSectorAnglesAtRadius(geometry, i, radius));
      assert.ok(Math.abs(sections.reduce((sum, sector) => sum + sector.span, 0) - 2 * Math.PI) < 0.000001);
      for (let i = 0; i < sections.length; i++) {
        assert.ok(sections[i].span > 0.04, `sector ${i} squeezed shut in ${sectorCount}-region scenario at radius ${radius}`);
        const midpoint = sections[i].start + sections[i].span / 2;
        assert.equal(hillSectorIndexAtAngle(midpoint, radius, geometry), i);
      }
    }
    if (sectorCount > 2) {
      const smallest = counts.indexOf(Math.min(...counts));
      const largest = counts.indexOf(Math.max(...counts));
      assert.ok(geometry[largest].span > geometry[smallest].span, 'larger sectors retain more display area');
    }
  }
});

test('large bubbles at the shared hub cannot cross either curved wall, including pinned positions', () => {
  const geometry = buildSectorGeometry(3, [7, 12, 35]);
  const ellipse = { cx: 450, cy: 450, rx: 425, ry: 425 };
  // Both bubbles start on or very near the shared central junction.
  // Previously the packer could accept a centre-safe position while the
  // visible circumference extended across the parabolic divider.
  const visuals = [
    { id: 'pinned-hub', x: 450, y: 450, radius: 54, sectorIndex: 0, coefficient: 0.95, pinned: true },
    { id: 'near-hub', x: 465, y: 460, radius: 38, sectorIndex: 1, coefficient: 0.78 },
    { id: 'third', x: 420, y: 475, radius: 26, sectorIndex: 2, coefficient: 0.5 }
  ];
  const positions = linkedBubblePositions(visuals, {
    minX: 20, maxX: 880, minY: 20, maxY: 880,
    ellipse, hillSectors: geometry, compact: true
  });
  assert.equal(positions.size, visuals.length);
  for (const bubble of visuals) {
    const position = positions.get(bubble.id)!;
    const dx = (position.x - ellipse.cx) / ellipse.rx;
    const dy = (position.y - ellipse.cy) / ellipse.ry;
    assert.equal(hillSectorIndexAtAngle(Math.atan2(dy, dx), Math.hypot(dx, dy), geometry), bubble.sectorIndex);
    const gapToWall = (boundaryIndex: number) => {
      const curve = hillBoundaryCurve(geometry, boundaryIndex);
      let closest = Infinity;
      for (let step = 0; step <= 1000; step++) {
        const t = step / 1000;
        const x = ellipse.cx + ellipse.rx * (2 * t * (1 - t) * curve.control.x + t * t * curve.end.x);
        const y = ellipse.cy + ellipse.ry * (2 * t * (1 - t) * curve.control.y + t * t * curve.end.y);
        closest = Math.min(closest, Math.hypot(position.x - x, position.y - y));
      }
      return closest;
    };
    const first = gapToWall(bubble.sectorIndex);
    const second = gapToWall((bubble.sectorIndex + 1) % geometry.length);
    assert.ok(first >= bubble.radius + 8, `${bubble.id} crosses the leading wall: ${first}`);
    assert.ok(second >= bubble.radius + 8, `${bubble.id} crosses the trailing wall: ${second}`);
  }
  assert.notDeepEqual(positions.get('pinned-hub'), { x: 450, y: 450 });
});

test('sector wash has readable light-theme boundaries and soft feathering without blurring bubbles', async () => {
  const source = await readFile(new URL('../../client/src/components/BubbleField.tsx', import.meta.url), 'utf8');
  assert.match(source, /stopOpacity=\{isLightTheme \? 0\.057 : 0\.028\}/);
  assert.match(source, /stopOpacity=\{isLightTheme \? 0\.108 : 0\.060\}/);
  assert.match(source, /<clipPath id="petal-sector-oval-clip">/);
  assert.match(source, /<filter id="petal-sector-feather"/);
  assert.match(source, /<feGaussianBlur stdDeviation=\{isLightTheme \? 15 : 20\}/);
  assert.match(source, /<g clipPath="url\(#petal-sector-oval-clip\)" pointerEvents="none">\s*<g filter="url\(#petal-sector-feather\)">[\s\S]*?sectorGeometry\.map\(\(_, idx\) => \([\s\S]*?fill=\{\`url\(#petal-sector-gradient-\$\{idx\}\)\`\}/);
  // The filter closes before the dynamic drag target and before bubbles are rendered.
  const clippedStart = source.indexOf('<g clipPath="url(#petal-sector-oval-clip)"');
  const filterEnd = source.indexOf('</g>\n            </g>', clippedStart);
  const dragTarget = source.indexOf('dragView?.changesSector && !dragView.target', clippedStart);
  const bubbleAnimation = source.indexOf('<AnimatePresence>', clippedStart);
  assert.ok(clippedStart >= 0 && filterEnd > clippedStart && dragTarget > filterEnd && bubbleAnimation > dragTarget);
  assert.match(source, /stroke=\{isLightTheme \? '#7898ac' : '#cbd5e1'\}/);
  assert.match(source, /strokeWidth=\{isLightTheme \? 1\.9 : 1\.5\}/);
  assert.match(source, /strokeOpacity=\{isLightTheme \? 0\.48 : 0\.28\}/);
});

test('higher-coefficient bubbles occupy inner radial layers ahead of smaller tasks', () => {
  const geometry = buildSectorGeometry(3, [3, 3, 3]);
  const ellipse = { cx: 450, cy: 450, rx: 425, ry: 425 };
  const priorities = [
    { rank: 'high', radius: 56, coefficient: 0.98 },
    { rank: 'medium', radius: 36, coefficient: 0.60 },
    { rank: 'low', radius: 20, coefficient: 0.14 }
  ];
  const visuals = geometry.flatMap((sector, sectorIndex) => priorities.map((priority) => ({
    id: `${sectorIndex}-${priority.rank}`,
    x: ellipse.cx + Math.cos(sector.midAngle) * ellipse.rx * 0.62,
    y: ellipse.cy + Math.sin(sector.midAngle) * ellipse.ry * 0.62,
    radius: priority.radius,
    coefficient: priority.coefficient,
    sectorIndex
  })));
  const placed = linkedBubblePositions(visuals, {
    minX: 20, maxX: 880, minY: 20, maxY: 880,
    ellipse, hillSectors: geometry, compact: true
  });
  const radial = (id: string) => {
    const point = placed.get(id)!;
    return Math.hypot((point.x - ellipse.cx) / ellipse.rx,
      (point.y - ellipse.cy) / ellipse.ry);
  };
  assert.equal(placed.size, visuals.length);
  for (let index = 0; index < geometry.length; index++) {
    const high = radial(`${index}-high`);
    const medium = radial(`${index}-medium`);
    const low = radial(`${index}-low`);
    assert.ok(high + 0.04 < low, `higher coefficient must sit inside the low-priority bubble in sector ${index}: ${high} vs ${low}`);
    assert.ok(high < medium + 0.05, `large bubble should stay in the inner layer in sector ${index}`);
    assert.ok(medium < low + 0.05, `medium bubble should generally precede small ones in sector ${index}`);
  }
  for (const bubble of visuals) {
    const point = placed.get(bubble.id)!;
    const x = (point.x - ellipse.cx) / ellipse.rx;
    const y = (point.y - ellipse.cy) / ellipse.ry;
    assert.equal(hillSectorIndexAtAngle(Math.atan2(y, x), Math.hypot(x, y), geometry), bubble.sectorIndex);
  }
});

test('sector priority layers stay soft for pinned tasks and do not change global packing', () => {
  const geometry = buildSectorGeometry(3, [2, 2, 2]);
  const ellipse = { cx: 450, cy: 450, rx: 425, ry: 425 };
  const pinned = { id: 'saved', x: 450 + Math.cos(geometry[0].midAngle) * 305,
    y: 450 + Math.sin(geometry[0].midAngle) * 305, radius: 27,
    coefficient: 0.99, sectorIndex: 0, pinned: true };
  const other = { id: 'smaller', x: 450 + Math.cos(geometry[0].midAngle) * 245,
    y: 450 + Math.sin(geometry[0].midAngle) * 245, radius: 22,
    coefficient: 0.21, sectorIndex: 0 };
  const sectorResult = linkedBubblePositions([pinned, other], {
    minX: 20, maxX: 880, minY: 20, maxY: 880,
    ellipse, hillSectors: geometry, compact: true
  });
  assert.deepEqual(sectorResult.get('saved'), { x: pinned.x, y: pinned.y });
  const original = linkedBubblePositions([pinned, other], {
    minX: 20, maxX: 880, minY: 20, maxY: 880,
    ellipse, compact: false
  });
  assert.deepEqual(original.get('saved'), { x: pinned.x, y: pinned.y });
});
