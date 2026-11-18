/**
 * Sector backgrounds are neutral mineral/slate surfaces, not variations of the
 * sector's brand color. The sector still retains its own hue in the name/icon,
 * but a pink or orange bubble can never sit on a pink or orange sector wash.
 *
 * A few quiet cool-neutral alternatives separate neighboring areas without
 * competing with the five importance colors used for task bubbles.
 */
const LIGHT_SECTOR_SURFACES = [
  { center: '#e2ecf1', edge: '#cbdce5' },
  { center: '#e7ebf0', edge: '#d0d8e2' },
  { center: '#e4edea', edge: '#cbdcd5' },
  { center: '#e9edf0', edge: '#d6dee2' },
  { center: '#e3e9ed', edge: '#c9d3dc' },
  { center: '#e5eeed', edge: '#cddedc' }
] as const;

const DARK_SECTOR_SURFACES = [
  { center: '#132837', edge: '#1a3344' },
  { center: '#192838', edge: '#223549' },
  { center: '#142d32', edge: '#1d3b42' },
  { center: '#1c2d37', edge: '#273d48' },
  { center: '#172536', edge: '#203147' },
  { center: '#192e32', edge: '#234044' }
] as const;

/**
 * WCAG 2.2 SC 1.4.11: meaningful graphical boundaries need >= 3:1
 * non-text contrast. The outline is measured against BOTH the neutral surface
 * and the bubble fill as actually composited with its existing opacity.
 *
 * These stronger outlines apply only in sector mode. The five task hues,
 * bubble fills, task text and the global view remain unchanged.
 */
export const SECTOR_BUBBLE_OUTLINE = {
  light: { color: '#1b354d', opacity: 0.94, width: 3.2 },
  dark: { color: '#f8fafc', opacity: 1, width: 3.2 }
} as const;

export function getSectorBackgroundPalette(
  sectorIndex: number,
  isLightTheme: boolean
): { center: string; edge: string } {
  const palette = isLightTheme ? LIGHT_SECTOR_SURFACES : DARK_SECTOR_SURFACES;
  // The index is intentionally independent of a user's custom sphere color.
  return palette[((Math.trunc(sectorIndex) % palette.length) + palette.length) % palette.length];
}
