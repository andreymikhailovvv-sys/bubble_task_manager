/** Subdued sector surfaces: category hues stay recognizable, while the
 * importance-colored bubbles remain the brightest elements in the field. */
const DEFAULT_SECTOR_COLOR = '#64748b';

function parseHexColor(value: string | undefined): [number, number, number] {
  const hex = (value ?? '').trim().replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(hex)) {
    return [...hex].map((digit) => parseInt(digit + digit, 16)) as [number, number, number];
  }
  if (/^[\da-f]{6}$/i.test(hex)) {
    return [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16)) as [number, number, number];
  }
  return parseHexColor(DEFAULT_SECTOR_COLOR);
}

function mixHex(color: string | undefined, neutral: string, sectorWeight: number): string {
  const source = parseHexColor(color);
  const background = parseHexColor(neutral);
  return '#' + source.map((channel, index) =>
    Math.round(channel * sectorWeight + background[index] * (1 - sectorWeight))
      .toString(16).padStart(2, '0')).join('');
}

export function getSectorBackgroundPalette(
  sectorColor: string | undefined,
  isLightTheme: boolean
): { center: string; edge: string } {
  return isLightTheme
    ? {
        center: mixHex(sectorColor, '#e7edf3', 0.14),
        edge: mixHex(sectorColor, '#c4d0dc', 0.25)
      }
    : {
        center: mixHex(sectorColor, '#132337', 0.13),
        edge: mixHex(sectorColor, '#172b42', 0.24)
      };
}
