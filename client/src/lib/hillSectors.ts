/**
 * Soft, shared sector boundaries. The same radial curves are used for SVG
 * painting, drag/drop hit-testing and packing constraints.
 * Coordinates follow SVG convention: 0 points right, positive angles down.
 */
export type HillSectorAngles = {
  startAngle: number;
  endAngle: number;
  midAngle: number;
  span: number;
};

const FULL_TURN = Math.PI * 2;
const wrapAngle = (angle: number) => ((angle % FULL_TURN) + FULL_TURN) % FULL_TURN;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * A gently curving valley instead of a straight divider. Each boundary is
 * shared by its two neighbouring sectors, so the regions never leave gaps.
 * The bend returns to zero at the centre and at the outer ellipse.
 */
export function hillBoundaryAngle(
  geometries: HillSectorAngles[],
  boundaryIndex: number,
  radiusRatio: number
): number {
  const count = geometries.length;
  if (!count) return 0;
  const index = ((boundaryIndex % count) + count) % count;
  const preceding = geometries[(index + count - 1) % count];
  const following = geometries[index];
  const baseAngle = following.startAngle;
  if (count <= 1) return baseAngle;

  // Limit distortion in a narrow region when task counts are unbalanced.
  const amplitude = Math.min(0.235, Math.max(0, Math.min(preceding.span, following.span) * 0.15));
  const t = clamp01(radiusRatio);
  const shoulder = Math.sin(Math.PI * t);
  const stagger = Math.cos(index * 2.399963229728653 + 0.55);
  const sweep = 0.82 + 0.18 * Math.cos(Math.PI * t);
  return baseAngle + amplitude * stagger * shoulder * sweep;
}

export function hillSectorAnglesAtRadius(
  geometries: HillSectorAngles[],
  index: number,
  radiusRatio: number
): { start: number; end: number; span: number } {
  if (geometries.length <= 1) return { start: 0, end: FULL_TURN, span: FULL_TURN };
  const start = hillBoundaryAngle(geometries, index, radiusRatio);
  const end = index === geometries.length - 1
    ? hillBoundaryAngle(geometries, 0, radiusRatio) + FULL_TURN
    : hillBoundaryAngle(geometries, index + 1, radiusRatio);
  return { start, end, span: end - start };
}

export function hillSectorIndexAtAngle(
  angle: number,
  radiusRatio: number,
  geometries: HillSectorAngles[]
): number {
  if (geometries.length <= 1) return 0;
  for (let index = 0; index < geometries.length; index += 1) {
    const sector = hillSectorAnglesAtRadius(geometries, index, radiusRatio);
    if (wrapAngle(angle - sector.start) < sector.span) return index;
  }
  // Numerical tolerance at a divider: preserve a deterministic destination.
  return 0;
}

/** The soft hilltop lies out from the shared centre, on the sector bisector. */
export function hillPeakAngle(geometry: HillSectorAngles): number {
  return geometry.midAngle;
}
