import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { getSectorBackgroundPalette } from './bubbleSectorPalette';

const DEFAULT_SECTOR_COLORS = ['#22c55e', '#ec4899', '#f97316'];

const distance = (left: string, right: string) => Math.hypot(
  ...[1, 3, 5].map((index) =>
    parseInt(left.slice(index, index + 2), 16) - parseInt(right.slice(index, index + 2), 16))
);

const luminance = (hex: string) => {
  const components = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return components[0] * 0.2126 + components[1] * 0.7152 + components[2] * 0.0722;
};

test('starter sector surfaces remain distinct and suitably muted in both themes', () => {
  for (const isLightTheme of [true, false]) {
    const palettes = DEFAULT_SECTOR_COLORS.map((color) =>
      getSectorBackgroundPalette(color, isLightTheme));
    for (const palette of palettes) {
      for (const color of [palette.center, palette.edge]) {
        assert.match(color, /^#[0-9a-f]{6}$/);
        assert.ok(
          isLightTheme ? luminance(color) > 0.40 : luminance(color) < 0.13,
          `Sector surface must remain ${isLightTheme ? 'light' : 'dark'}: ${color}`
        );
      }
    }
    for (let i = 0; i < palettes.length; i++) {
      for (let j = i + 1; j < palettes.length; j++) {
        assert.ok(distance(palettes[i].edge, palettes[j].edge) > 20,
          'Default sectors should be visually distinguishable');
      }
    }
  }
});

test('sector backgrounds support custom hex colors and safe fallbacks', () => {
  assert.deepEqual(getSectorBackgroundPalette('#fff', false),
    getSectorBackgroundPalette('#ffffff', false));
  assert.deepEqual(getSectorBackgroundPalette('invalid', true),
    getSectorBackgroundPalette('#64748b', true));
});

test('bubble importance hues are unchanged and the default task-information panel is legible', async () => {
  const component = await readFile(new URL('../components/BubbleField.tsx', import.meta.url), 'utf8');
  assert.match(component, /1: '#38bdf8',[\s\S]*2: '#22d3ee',[\s\S]*3: '#8b5cf6',[\s\S]*4: '#f97316',[\s\S]*5: '#ef4444'/);
  assert.match(component, /getSectorBackgroundPalette\(bubbleSectors\[index\]\?\.color, isLightTheme\)/);
  assert.match(component, /stopColor=\{palette\.center\}/);
  assert.match(component, /stopColor=\{palette\.edge\}/);
  assert.match(component, /bubble-task-info-eyebrow text-2xl font-bold/);
  assert.match(component, /text-\[23px\] font-medium leading-relaxed text-muted/);
});
