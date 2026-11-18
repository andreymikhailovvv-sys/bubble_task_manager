import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { getSectorBackgroundPalette, SECTOR_BUBBLE_OUTLINE } from './bubbleSectorPalette';

/** WCAG 2.2 relative luminance and contrast ratio, including compositing. */
const rgb = (color: string): [number, number, number] =>
  [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16)) as [number, number, number];

const composite = (foreground: number[], background: number[], opacity: number) =>
  foreground.map((channel, index) => channel * opacity + background[index] * (1 - opacity));

const luminance = (color: number[]) => {
  const linear = color.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
};

const contrastRatio = (a: number[], b: number[]) => {
  const high = Math.max(luminance(a), luminance(b));
  const low = Math.min(luminance(a), luminance(b));
  return (high + 0.05) / (low + 0.05);
};

// Matches getBubbleShade: only the background/outline is being redesigned.
const shade = (color: string, distanceRatio: number) => {
  const fade = 0.04 + distanceRatio * 0.72;
  return rgb(color).map((channel) => Math.round(channel + (255 - channel) * fade));
};

const IMPORTANCE_COLORS = ['#38bdf8', '#22d3ee', '#8b5cf6', '#f97316', '#ef4444'];

test('sector surfaces never borrow a sector hue, even when a sector and bubble are both pink', () => {
  for (const isLightTheme of [true, false]) {
    const palettes = Array.from({ length: 6 }, (_, index) => getSectorBackgroundPalette(index, isLightTheme));
    for (const palette of palettes) {
      for (const background of [palette.center, palette.edge]) {
        assert.match(background, /^#[0-9a-f]{6}$/);
        const [r, g, b] = rgb(background);
        // Cool neutral/slate, not pink/magenta/red/orange. Doesn't depend on sphere.color.
        assert.ok(b >= r && g >= r, `Found a warm/magenta sector background: ${background}`);
        assert.ok(isLightTheme ? luminance(rgb(background)) > 0.55 : luminance(rgb(background)) < 0.07);
      }
    }
    assert.notDeepEqual(palettes[0], palettes[1], 'neighboring sectors retain a quiet tonal distinction');
    assert.notDeepEqual(palettes[1], palettes[2]);
    assert.deepEqual(getSectorBackgroundPalette(6, isLightTheme), palettes[0]);
    assert.deepEqual(getSectorBackgroundPalette(-1, isLightTheme), palettes[5]);
  }
});

test('bubble outlines satisfy WCAG 2.2 non-text contrast 3:1 in both themes', () => {
  for (const isLightTheme of [true, false]) {
    const outline = SECTOR_BUBBLE_OUTLINE[isLightTheme ? 'light' : 'dark'];
    assert.ok(outline.width >= 3);
    for (let index = 0; index < 6; index++) {
      const palette = getSectorBackgroundPalette(index, isLightTheme);
      for (const surfaceColor of [palette.center, palette.edge]) {
        const surface = rgb(surfaceColor);
        const outsideOutline = composite(rgb(outline.color), surface, outline.opacity);
        assert.ok(contrastRatio(outsideOutline, surface) >= 3,
          `Outside boundary insufficient: ${surfaceColor} / ${outline.color}`);
        for (const bubbleColor of IMPORTANCE_COLORS) {
          // Check every priority, both sector-gradient stops, and light/dark
          // highlights from the centre to the outer ring of the layout.
          for (const distanceRatio of [0, 0.25, 0.5, 0.75, 1]) {
            const bubbleFill = composite(
              shade(bubbleColor, distanceRatio),
              surface,
              isLightTheme ? 0.66 : 0.48
            );
            const insideOutline = composite(rgb(outline.color), bubbleFill, outline.opacity);
            assert.ok(contrastRatio(insideOutline, bubbleFill) >= 3,
              `Inside boundary insufficient: ${bubbleColor} on ${surfaceColor}, ${distanceRatio}`);
          }
        }
      }
    }
  }
});

test('sector-only change preserves importance colors, the global view and the larger info panel', async () => {
  const component = await readFile(new URL('../components/BubbleField.tsx', import.meta.url), 'utf8');
  assert.match(component, /1: '#38bdf8',[\s\S]*2: '#22d3ee',[\s\S]*3: '#8b5cf6',[\s\S]*4: '#f97316',[\s\S]*5: '#ef4444'/);
  assert.match(component, /getSectorBackgroundPalette\(index, isLightTheme\)/);
  assert.doesNotMatch(component, /getSectorBackgroundPalette\(bubbleSectors\[index\]/);
  assert.match(component, /const sectorBubbleOutline = mode === 'sectors' && sectorCount > 1/);
  assert.match(component, /sectorBubbleOutline\?\.color/);
  assert.match(component, /sectorBubbleOutline\?\.opacity/);
  assert.match(component, /sectorBubbleOutline\?\.width/);
  assert.match(component, /stopColor=\{palette\.center\}/);
  assert.match(component, /stopColor=\{palette\.edge\}/);
  assert.match(component, /fillOpacity=\{isLightTheme \? 0\.66 : 0\.48\}/);
  assert.match(component, /bubble-task-info-eyebrow text-2xl font-bold/);
  assert.match(component, /text-\[23px\] font-medium leading-relaxed text-muted/);
});
