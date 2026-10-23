import type { Bubble, SectorGeometry } from './layout';

export type Point = { x: number; y: number };
export type Rectangle = { left: number; top: number; right: number; bottom: number };
export type RectangleBubbleLayout = {
  bubbles: Bubble[];
  geometry: SectorGeometry[];
  rotation: number;
};

const FULL = Math.PI * 2;
const ANGLE_BINS = 720;
const STEP = FULL / ANGLE_BINS;
const GRID_STEP = 13;
const SAFE_EDGE = 10;

function polygonArea(vertices: Point[]): number {
  return Math.abs(vertices.reduce((sum, p, i) => {
    const q = vertices[(i + 1) % vertices.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0)) / 2;
}

function normalizeAngle(angle: number) {
  return ((angle % FULL) + FULL) % FULL;
}

function angularDifference(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

export function rectangleRayEnd(center: Point, rect: Rectangle, angle: number, inset = 0): Point {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const xDistance = dx > 0 ? rect.right - inset - center.x : center.x - rect.left - inset;
  const yDistance = dy > 0 ? rect.bottom - inset - center.y : center.y - rect.top - inset;
  const length = Math.min(xDistance / Math.max(Math.abs(dx), 1e-8), yDistance / Math.max(Math.abs(dy), 1e-8));
  return { x: center.x + dx * length, y: center.y + dy * length };
}

function clipWithRay(vertices: Point[], center: Point, angle: number, sign: 1 | -1): Point[] {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const distance = (point: Point) => sign * (ux * (point.y - center.y) - uy * (point.x - center.x));
  const next: Point[] = [];
  vertices.forEach((point, i) => {
    const following = vertices[(i + 1) % vertices.length];
    const first = distance(point);
    const second = distance(following);
    if (first >= -1e-6) next.push(point);
    if ((first < -1e-6 && second > 1e-6) || (first > 1e-6 && second < -1e-6)) {
      const fraction = first / (first - second);
      next.push({
        x: point.x + (following.x - point.x) * fraction,
        y: point.y + (following.y - point.y) * fraction
      });
    }
  });
  return next;
}

function sectorPolygon(rect: Rectangle, center: Point, start: number, end: number, isGlobal: boolean) {
  const corners = [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom }
  ];
  if (isGlobal) return corners;
  return clipWithRay(clipWithRay(corners, center, start, 1), center, end, -1);
}

function centerFitsPolygon(point: Point, polygon: Point[], clearance: number) {
  // Rectangle and clipped wedges are convex and clockwise in screen coordinates.
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const edgeLength = Math.hypot(dx, dy);
    if (edgeLength < 1e-6) continue;
    const inwardDistance = (dx * (point.y - a.y) - dy * (point.x - a.x)) / edgeLength;
    if (inwardDistance < clearance) return false;
  }
  return true;
}

function computeAreaShares(bubbles: Bubble[], count: number) {
  const sums = Array.from({ length: count }, () => 0);
  for (const bubble of bubbles) {
    sums[Math.min(count - 1, Math.max(0, bubble.sectorIndex))] += (bubble.radius + 7) ** 2;
  }
  // Empty sectors still need enough room to receive a new task.
  const maxSum = Math.max(...sums, 1);
  const weights = sums.map((sum) => Math.max(sum, maxSum * (count >= 6 ? 0.035 : 0.075)));
  const shares = Array.from({ length: count }, () => 0);
  const active = new Set(weights.map((_, index) => index));
  const maxShare = count <= 2 ? 0.5 : 0.485;
  let remaining = 1;
  while (active.size) {
    const totalWeight = [...active].reduce((sum, index) => sum + weights[index], 0);
    const capped = [...active].filter((index) => (weights[index] / totalWeight) * remaining > maxShare);
    if (!capped.length) {
      for (const index of active) shares[index] = remaining * weights[index] / totalWeight;
      break;
    }
    for (const index of capped) {
      shares[index] = maxShare;
      remaining -= maxShare;
      active.delete(index);
    }
  }
  return shares;
}

function buildRectangularSectorGeometry(
  bubbles: Bubble[],
  count: number,
  rect: Rectangle,
  center: Point
): { geometry: SectorGeometry[]; rotation: number } {
  if (count === 1) {
    return { geometry: [{ startAngle: 0, endAngle: FULL, midAngle: Math.PI, span: FULL }], rotation: 0 };
  }
  const shares = computeAreaShares(bubbles, count);
  const areaByAngle = Array.from({ length: ANGLE_BINS }, (_, index) => {
    const ray = rectangleRayEnd(center, rect, (index + 0.5) * STEP);
    return Math.hypot(ray.x - center.x, ray.y - center.y) ** 2 * STEP * 0.5;
  });
  const cumulative = [0];
  for (let i = 0; i < ANGLE_BINS * 2; i += 1) {
    cumulative.push(cumulative[i] + areaByAngle[i % ANGLE_BINS]);
  }
  const totalArea = cumulative[ANGLE_BINS];
  const largestSector = shares.indexOf(Math.max(...shares));

  const splitAt = (startIndex: number) => {
    const boundaries = [startIndex * STEP];
    let desiredArea = cumulative[startIndex];
    let searchIndex = startIndex + 1;
    for (let i = 0; i < count - 1; i += 1) {
      desiredArea += shares[i] * totalArea;
      while (searchIndex < startIndex + ANGLE_BINS && cumulative[searchIndex] < desiredArea) searchIndex += 1;
      const previousArea = cumulative[searchIndex - 1];
      const part = Math.max(0, Math.min(1, (desiredArea - previousArea) / (cumulative[searchIndex] - previousArea || 1)));
      boundaries.push((searchIndex - 1 + part) * STEP);
    }
    boundaries.push(boundaries[0] + FULL);
    return boundaries;
  };

  // The largest group gets the broad left-hand region; smaller groups share
  // the top/right/bottom. The sector order itself is never changed.
  let best = splitAt(0);
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ANGLE_BINS; i += 4) {
    const candidate = splitAt(i);
    const largestMidpoint = (candidate[largestSector] + candidate[largestSector + 1]) / 2;
    const leftOffset = angularDifference(largestMidpoint, Math.PI);
    const oversize = candidate.slice(0, -1).reduce((penalty, angle, index) =>
      penalty + Math.max(0, candidate[index + 1] - angle - Math.PI + 0.0001) ** 2, 0);
    const score = leftOffset * leftOffset + oversize * 100;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  const rotation = best[0];
  return {
    rotation,
    geometry: shares.map((_, index) => {
      const startAngle = best[index] - rotation;
      const endAngle = best[index + 1] - rotation;
      return { startAngle, endAngle, midAngle: (startAngle + endAngle) / 2, span: endAngle - startAngle };
    })
  };
}

function makeCandidates(polygon: Point[], rect: Rectangle) {
  const minX = Math.max(rect.left + SAFE_EDGE, Math.min(...polygon.map((point) => point.x)));
  const maxX = Math.min(rect.right - SAFE_EDGE, Math.max(...polygon.map((point) => point.x)));
  const minY = Math.max(rect.top + SAFE_EDGE, Math.min(...polygon.map((point) => point.y)));
  const maxY = Math.min(rect.bottom - SAFE_EDGE, Math.max(...polygon.map((point) => point.y)));
  const points: Point[] = [];
  let row = 0;
  for (let y = minY + GRID_STEP / 2; y <= maxY; y += GRID_STEP) {
    for (let x = minX + ((row % 2) * GRID_STEP / 2); x <= maxX; x += GRID_STEP) {
      points.push({ x, y });
    }
    row += 1;
  }
  return points;
}

function packSector(
  bubbles: Bubble[],
  polygon: Point[],
  center: Point,
  geometry: SectorGeometry | null,
  rotation: number,
  rect: Rectangle
): Bubble[] {
  if (!bubbles.length) return [];
  const area = polygonArea(polygon);
  const occupiedArea = bubbles.reduce((sum, bubble) => sum + Math.PI * (bubble.radius + 7) ** 2, 0);
  const scale = Math.min(1.12, Math.sqrt(area * 0.38 / Math.max(1, occupiedArea)));
  const sorted = [...bubbles].sort((a, b) => b.radius - a.radius || a.task.id.localeCompare(b.task.id));
  const vertices = polygon.map((point) => Math.hypot(point.x - center.x, point.y - center.y));
  const maxReach = Math.max(...vertices);
  const candidates = makeCandidates(polygon, rect);
  const global = !geometry || geometry.span >= FULL - 0.0001;
  const sectorStart = (geometry?.startAngle ?? 0) + rotation;
  const sectorSpan = geometry?.span ?? FULL;
  const labelAngle = sectorStart + sectorSpan / 2;
  const labelTip = rectangleRayEnd(center, rect, labelAngle, 76);
  const label = {
    x: Math.max(rect.left + 96, Math.min(rect.right - 96, labelTip.x)),
    y: Math.max(rect.top + 50, Math.min(rect.bottom - 55, labelTip.y))
  };

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const factor = scale * 0.89 ** attempt;
    const placed: Bubble[] = [];
    let success = true;
    for (let index = 0; index < sorted.length; index += 1) {
      const bubble = sorted[index];
      const radius = Math.max(1.5, bubble.radius * factor);
      const clearance = radius + Math.max(2, radius * 0.025);
      const rank = sorted.length <= 1 ? 0.18 : index / (sorted.length - 1);
      const distance = maxReach * (0.19 + 0.64 * rank ** 0.72);
      const angle = global
        ? index * 2.399963229728653
        : sectorStart + sectorSpan * (index === 0 ? 0.5 : 0.12 + ((index * 0.618033988749895) % 1) * 0.76);
      const desiredX = center.x + Math.cos(angle) * distance;
      const desiredY = center.y + Math.sin(angle) * distance;
      let best: Point | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const candidate of candidates) {
        const dx = candidate.x - desiredX;
        const dy = candidate.y - desiredY;
        const score = dx * dx + dy * dy;
        if (score >= bestScore || !centerFitsPolygon(candidate, polygon, clearance)) continue;
        if (!global &&
          Math.abs(candidate.x - label.x) < radius + 88 &&
          Math.abs(candidate.y - label.y) < radius + 34) continue;
        if (placed.some((other) => (other.x - candidate.x) ** 2 + (other.y - candidate.y) ** 2
          < (other.radius + radius + 5) ** 2)) continue;
        best = candidate;
        bestScore = score;
      }
      if (!best) {
        success = false;
        break;
      }
      placed.push({ ...bubble, x: best.x, y: best.y, radius });
    }
    if (success) return placed;
  }
  // Extremely dense views still keep every task. With hundreds of bubbles the
  // scanner may be unable to find room for the last one: try microscopic sizes.
  // Regular task collections finish in the first few attempts.
  return sorted.map((bubble, index) => {
    const point = candidates[index % Math.max(1, candidates.length)] ?? center;
    return { ...bubble, x: point.x, y: point.y, radius: 1 };
  });
}

/**
 * Place bubbles in real rectangular wedge polygons. Unlike a polar-to-rectangle
 * visual projection, this solver checks every bubble against both dividing
 * rays and already placed circles in screen coordinates.
 */
export function layoutRectangleBubbles(source: Bubble[], sectorCount: number, rect: Rectangle): RectangleBubbleLayout {
  const count = Math.max(1, sectorCount);
  const center = { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
  const { geometry, rotation } = buildRectangularSectorGeometry(source, count, rect, center);
  const arranged: Bubble[] = [];
  for (let index = 0; index < count; index += 1) {
    const sector = geometry[index];
    const polygon = sectorPolygon(rect, center, rotation + sector.startAngle, rotation + sector.endAngle, count === 1);
    const sectorBubbles = source.filter((bubble) => bubble.sectorIndex === index);
    arranged.push(...packSector(sectorBubbles, polygon, center, count === 1 ? null : sector, rotation, rect));
  }
  const byId = new Map(arranged.map((bubble) => [bubble.task.id, bubble]));
  return { bubbles: source.map((bubble) => byId.get(bubble.task.id) ?? bubble), geometry, rotation: normalizeAngle(rotation) };
}
