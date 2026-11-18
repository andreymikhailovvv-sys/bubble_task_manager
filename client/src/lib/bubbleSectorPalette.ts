/**
 * Distinct, harmonized CHROMATIC washes for task sectors.
 *
 * Default new-user sectors are green, pink and orange. Their backgrounds are
 * respectively lavender, sea-glass blue and periwinkle blue: not tinted
 * versions of their sector colors, nor an all-grey set of near-duplicates.
 * Task bubble fills and their five priority colors remain untouched.
 *
 * The six alternatives cover custom/reordered sectors and both app themes.
 * Edges of task bubbles retain the sector-only WCAG 2.2 1.4.11 outlines.
 */
const LIGHT_SECTOR_SURFACES = [
  { center: '#ded3f4', edge: '#c9b8eb' }, // lavender, default green sector
  { center: '#c5e4dc', edge: '#9fd1c4' }, // sea-glass, default pink sector
  { center: '#cddbf6', edge: '#a9c3ea' }, // blue, default orange sector
  { center: '#d7d8f5', edge: '#bcc2ee' }, // periwinkle
  { center: '#c5e6e2', edge: '#9ccfcb' }, // aqua
  { center: '#e4d6f0', edge: '#cebce5' }  // orchid
] as const;

const DARK_SECTOR_SURFACES = [
  { center: '#312547', edge: '#3a2a51' },
  { center: '#14352f', edge: '#1b4037' },
  { center: '#182b48', edge: '#22334d' },
  { center: '#282747', edge: '#363459' },
  { center: '#12352c', edge: '#1b3b33' },
  { center: '#30243e', edge: '#3b2c4c' }
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
