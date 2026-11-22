import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEST_MAIN_MODULES, testMainAdd, testMainColumns, testMainDefaults, testMainMove,
  testMainNormalize, testMainOverlap, testMainReadLayouts, testMainReflow, testMainStorageKey
} from './testMainGrid';

const assertGrid = (blocks: ReturnType<typeof testMainDefaults>, columns: number) => {
  assert.equal(new Set(blocks.map(block => block.id)).size, blocks.length);
  for (const block of blocks) {
    const spec = TEST_MAIN_MODULES.find(item => item.kind === block.kind)!;
    assert.ok(block.x >= 0 && block.y >= 0);
    assert.ok(block.w >= Math.min(spec.minW, columns) && block.w <= columns);
    assert.ok(block.h >= spec.minH);
    assert.ok(block.x + block.w <= columns);
  }
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    assert.equal(testMainOverlap(blocks[i], blocks[j]), false, blocks[i].id + ' overlaps ' + blocks[j].id);
  }
};

test('breakpoints have predictable column counts and independent keys', () => {
  assert.equal(testMainColumns(719), 4);
  assert.equal(testMainColumns(720), 8);
  assert.equal(testMainColumns(1149), 8);
  assert.equal(testMainColumns(1150), 12);
  assert.notEqual(testMainStorageKey('a'), testMainStorageKey('b'));
});

test('default desktop, tablet and phone grids fit without collisions', () => {
  for (const columns of [4, 8, 12]) {
    const blocks = testMainDefaults(columns);
    assert.equal(blocks.length, 5);
    assertGrid(blocks, columns);
    assert.ok(blocks.some(block => block.kind === 'habits'));
    assert.ok(blocks.some(block => block.kind === 'chat'));
  }
});

test('move and resize respect minimum dimensions and push neighboring modules down', () => {
  const initial = testMainDefaults(12);
  const first = initial[0];
  const neighbor = initial[1];
  const moved = testMainMove(initial, first.id, { x: neighbor.x, y: neighbor.y }, 12);
  assertGrid(moved, 12);
  assert.equal(moved.find(block => block.id === first.id)!.x, 5); // 8 columns clamped to a 12-column width.
  assert.equal(initial[0].x, 0, 'do not mutate the original layout');
  const shrunk = testMainMove(moved, first.id, { w: 1, h: 1 }, 12);
  assertGrid(shrunk, 12);
  assert.equal(shrunk[0].w, 4);
  assert.equal(shrunk[0].h, 4);
});

test('adding any number of repeated module kinds never overlaps', () => {
  let layout = testMainDefaults(8);
  for (let i = 0; i < 20; i++) layout = testMainAdd(layout, i % 2 ? 'chat' : 'habits', 'extra-' + i, 8);
  assert.equal(layout.length, 25);
  assertGrid(layout, 8);
  assert.equal(testMainAdd(layout, 'habits', 'extra-0', 8).length, 25);
});

test('reflow preserves ids, heights and live module kinds across breakpoints', () => {
  let initial = testMainDefaults(12);
  initial = testMainAdd(initial, 'timeline', 'new-timeline', 12);
  initial = testMainAdd(initial, 'upcoming', 'new-upcoming', 12);
  for (const columns of [4, 8]) {
    const result = testMainReflow(initial, columns);
    assertGrid(result, columns);
    assert.deepEqual(new Set(result.map(item => item.id)), new Set(initial.map(item => item.id)));
    for (const block of result) assert.equal(block.h, initial.find(item => item.id === block.id)!.h);
  }
});

test('corrupt localStorage state is rejected and colliding modules are repaired', () => {
  assert.deepEqual(testMainReadLayouts('{broken'), {});
  const raw = [{ id: 'same', kind: 'chat', x: 0, y: 0, w: 4, h: 4 },
    { id: 'other', kind: 'notes', x: 0, y: 0, w: 4, h: 4 },
    { id: 'same', kind: 'habits', x: 3, y: 0, w: 3, h: 3 },
    { id: 'bad', kind: 'not-a-kind', x: 0, y: 0, w: 3, h: 3 },
    { id: 'nan', kind: 'tasks', x: Infinity, y: 0, w: 4, h: 4 }];
  const parsed = testMainReadLayouts(JSON.stringify({ 12: raw, 4: [] }));
  assertGrid(parsed['12'], 12);
  assert.equal(parsed['12'].length, 2);
  assert.deepEqual(parsed['4'], [], 'intentional empty layout must persist');
  assertGrid(testMainNormalize(raw, 12), 12);
});
