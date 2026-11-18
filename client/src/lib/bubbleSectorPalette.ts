/**
 * Quiet chromatic sector surfaces that support vivid importance bubbles.
 *
 * Default new-user sectors are green, pink and orange. Their backgrounds are
 * respectively muted lavender, sea-glass and blue: not tinted
 * versions of their sector colors. Surfaces stay deliberately low-emphasis.
 * Five importance hues remain unchanged; sector bubbles are more opaque.
 *
 * The six alternatives cover custom/reordered sectors and both app themes.
 * Edges of task bubbles retain the sector-only WCAG 2.2 1.4.11 outlines.
 */
const LIGHT_SECTOR_SURFACES = [
  { center: '#f1edf9', edge: '#e9e3f5' }, // muted lavender behind green sector
  { center: '#ebf6f1', edge: '#e1f0e8' }, // muted sea-glass behind pink
  { center: '#edf3fc', edge: '#e4edfa' }, // muted mist blue behind orange
  { center: '#f0f0fa', edge: '#e6e8f7' }, // muted periwinkle
  { center: '#eaf7f3', edge: '#dff0eb' }, // muted aqua
  { center: '#f6eff9', edge: '#eee5f5' }  // muted orchid
] as const;

const DARK_SECTOR_SURFACES = [
  { center: '#211d2c', edge: '#2a2337' }, // subdued violet
  { center: '#132720', edge: '#1b3028' }, // subdued sea-glass
  { center: '#152237', edge: '#1d2b42' }, // subdued blue
  { center: '#202137', edge: '#282a43' },
  { center: '#112820', edge: '#1a3229' },
  { center: '#291f31', edge: '#32263e' }
] as const;

const circularHueDistance = (left: number, right: number) => {
  const distance = Math.abs(left - right) % 360;
  return Math.min(distance, 360 - distance);
};

/** Accepts custom short and long hex colors, with safe invalid-color fallback. */
function sectorHue(color: string | undefined): number | null {
  if (!color) return null;
  const hex = color.trim().replace(/^#/, '');
  const normalized = /^[0-9a-f]{3}$/i.test(hex)
    ? [...hex].map((digit) => digit + digit).join('')
    : /^[0-9a-f]{6}$/i.test(hex) ? hex : null;
  if (!normalized) return null;
  const [r, g, b] = [0, 2, 4].map((index) =>
    parseInt(normalized.slice(index, index + 2), 16) / 255);
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const chroma = maximum - minimum;
  if (chroma < 0.025) return null; // achromatic sector has no competing hue
  let hue = 0;
  if (maximum === r) hue = ((g - b) / chroma) % 6;
  else if (maximum === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;
  return (hue * 60 + 360) % 360;
}

/** Stronger fill opacity makes the bubble, not the large background, the accent. */
export const SECTOR_BUBBLE_FILL = {
  light: { opacity: 0.92, fadeBase: 0.025, fadeRange: 0.37 },
  dark: { opacity: 0.86, fadeBase: 0.025, fadeRange: 0.37 }
} as const;

/**
 * Contrast is protected by the independently tested bubble outlines, not
 * by pretending that a pastel wash alone supplies WCAG non-text contrast.
 */
export const SECTOR_BUBBLE_OUTLINE = {
  light: { color: '#1b354d', opacity: 0.94, width: 3.2 },
  dark: { color: '#f8fafc', opacity: 1, width: 3.2 }
} as const;

export function getSectorBackgroundPalette(
  sectorIndex: number,
  isLightTheme: boolean,
  sectorColor?: string
): { center: string; edge: string } {
  const palette = isLightTheme ? LIGHT_SECTOR_SURFACES : DARK_SECTOR_SURFACES;
  const preferredIndex = Number.isFinite(sectorIndex)
    ? ((Math.trunc(sectorIndex) % palette.length) + palette.length) % palette.length
    : 0;
  const hue = sectorHue(sectorColor);
  if (hue === null) return palette[preferredIndex];
  // Calculate from the ACTUAL theme palette, rather than using approximate
  // hue constants that diverge between light and dark colors.
  const surfaceHues = palette.map((surface) => sectorHue(surface.center) ?? 0);

  // Keep the thoughtfully chosen defaults. For customized sector colors,
  // select a different-hued wash instead of recreating "pink on pink".
  if (circularHueDistance(hue, surfaceHues[preferredIndex]) >= 65) {
    return palette[preferredIndex];
  }
  const indices = surfaceHues.map((_, index) => index);
  indices.sort((a, b) =>
    circularHueDistance(hue, surfaceHues[b]) - circularHueDistance(hue, surfaceHues[a]) ||
    ((a - preferredIndex + palette.length) % palette.length) -
    ((b - preferredIndex + palette.length) % palette.length));
  return palette[indices[0]];
}
