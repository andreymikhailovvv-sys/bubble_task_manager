/**
 * Shared quadratic sector boundaries. A single parabolic Bézier separates
 * neighbouring regions; the same geometry drives drawing, hit-testing and
 * compact bubble placement, including fullscreen mode.
 */
export type HillSectorAngles = {
  startAngle: number;
  endAngle: number;
  midAngle: number;
  span: number;
};

export type HillPoint = { x: number; y: number };
export type HillBoundaryCurve = {
  /** Quadratic Bézier control point in normalized ellipse coordinates. */
  control: HillPoint;
  /** Boundary endpoint on the ellipse. The starting point is (0, 0). */
  end: HillPoint;
  /** Signed lateral bow relative to the sector boundary's radial ray. */
  bow: number;
};

const FULL_TURN = Math.PI * 2;
const wrapAngle = (angle: number) => ((angle % FULL_TURN) + FULL_TURN) % FULL_TURN;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Different sector spans come from buildSectorGeometry(taskCounts). */
export function hillBoundaryCurve(
  geometries: HillSectorAngles[],
  boundaryIndex: number
): HillBoundaryCurve {
  if (!geometries.length) {
    return { control: { x: 0.5, y: 0 }, end: { x: 1, y: 0 }, bow: 0 };
  }
  const count = geometries.length;
  const index = ((boundaryIndex % count) + count) % count;
  const previous = geometries[(index + count - 1) % count];
  const current = geometries[index];
  const angle = current.startAngle;
  // Gentle, one-sided quadratic arcs. With three sectors, the two lower
  // boundaries bow away from each other like the user's simple hill sketch.
  // Narrow sectors receive proportionally less bend to avoid crossings.
  const safeAmplitude = count <= 1 ? 0
    : Math.min(0.29, Math.min(previous.span, current.span) * 0.14);
  const direction = count === 3
    ? [0.18, 1, -1][index]
    : (index % 2 === 0 ? 1 : -1);
  const bow = safeAmplitude * direction;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    control: { x: 0.5 * c - bow * s, y: 0.5 * s + bow * c },
    end: { x: c, y: s },
    bow
  };
}

/**
 * Angle of the quadratic boundary at a given normalized distance from the
 * ellipse centre. For Q(t) = t * end + 2t(1-t) * bow * normal,
 * |Q(t)| = t * sqrt(1 + 4 bow²(1-t)²). A fixed iteration avoids
 * expensive polygon intersection in the bubble packer.
 */
export function hillBoundaryAngle(
  geometries: HillSectorAngles[],
  boundaryIndex: number,
  radiusRatio: number
): number {
  if (!geometries.length) return 0;
  const count = geometries.length;
  const index = ((boundaryIndex % count) + count) % count;
  const baseAngle = geometries[index].startAngle;
  if (count <= 1) return baseAngle;
  const bow = hillBoundaryCurve(geometries, index).bow;
  const radius = clamp01(radiusRatio);
  let t = radius;
  for (let i = 0; i < 5; i += 1) {
    t = radius / Math.sqrt(1 + 4 * bow * bow * (1 - t) * (1 - t));
  }
  return baseAngle + Math.atan2(2 * (1 - t) * bow, 1);
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

/** Existing coefficient ranking uses the bisector as its hilltop anchor. */
export function hillPeakAngle(geometry: HillSectorAngles): number {
  return geometry.midAngle;
}
