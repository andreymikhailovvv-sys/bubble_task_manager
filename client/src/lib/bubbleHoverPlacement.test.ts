import assert from 'node:assert/strict';
import test from 'node:test';
import { compactBubbleHoverPlacement, type BubbleHoverAnchor } from './bubbleHoverPlacement';

const bounds = (left: number, top: number, width: number, height: number): BubbleHoverAnchor => ({
  left, top, width, height, right: left + width, bottom: top + height
});

for (const scenario of [
  { name: 'bottom-left bubble', anchor: bounds(34, 680, 120, 120), w: 594, h: 850 },
  { name: 'bottom-right bubble', anchor: bounds(450, 690, 120, 120), w: 594, h: 850 },
  { name: 'narrow horizontal space', anchor: bounds(190, 615, 195, 115), w: 594, h: 850 },
  { name: 'near the top', anchor: bounds(185, 25, 205, 120), w: 594, h: 850 },
  { name: 'inside right split pane', anchor: bounds(360, 320, 90, 100), w: 650, h: 680 }
]) {
  test(`compact bubble hover fits viewport without obscuring its source: ${scenario.name}`, () => {
    const p = compactBubbleHoverPlacement(scenario.anchor, scenario.w, scenario.h);
    assert.ok(p.left >= 12, 'left viewport margin');
    assert.ok(p.top >= 12, 'top viewport margin');
    assert.ok(p.left + p.width <= scenario.w - 12 + 0.001, 'right viewport margin');
    assert.ok(p.top + p.maxHeight <= scenario.h - 12 + 0.001, 'bottom viewport margin');
    assert.ok(
      p.left + p.width <= scenario.anchor.left ||
      p.left >= scenario.anchor.right ||
      p.top + p.maxHeight <= scenario.anchor.top ||
      p.top >= scenario.anchor.bottom,
      'card and bubble must not intersect'
    );
  });
}
