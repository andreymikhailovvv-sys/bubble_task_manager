import { hillBoundaryCurve, hillSectorIndexAtAngle, type HillSectorAngles } from './hillSectors';

export type VisualBubble = {
  id: string;
  x: number;
  y: number;
  radius: number;
  linkedTaskIds?: string[];
  bubbleLinkAnchorId?: string | null;
  /** A manually saved location resists displacement by other bubbles. */
  pinned?: boolean;
  sectorIndex?: number;
  /** Live coefficient from the same ranking model used for bubble size. */
  coefficient?: number;
};

export type DropIntent = { targetId: string; kind: 'link' | 'nest' };
export type Point = { x: number; y: number };
export type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  ellipse?: { cx: number; cy: number; rx: number; ry: number };
  /** Sector rays in the same stretched SVG coordinate system as the circles. */
  sectors?: Array<{ start: Point; end: Point }>;
  /** Curved hill regions override straight ray constraints when supplied. */
  hillSectors?: HillSectorAngles[];
  /** Pack even unlinked tasks, instead of retaining the former sparse automatic layout. */
  compact?: boolean;
};

export type LinkedBubbleGroup = {
  ids: string[];
  anchorId: string;
  edges: Array<[string, string]>;
};

const LINK_GAP = 16;
const BUBBLE_CLEARANCE = 12;

/** Build visible connected components, preserving each real edge. */
export function getLinkedBubbleGroups(bubbles: VisualBubble[]): LinkedBubbleGroup[] {
  const byId = new Map(bubbles.map((bubble) => [bubble.id, bubble]));
  const adjacency = new Map(bubbles.map((bubble) => [bubble.id, [] as string[]]));
  for (const bubble of bubbles) {
    for (const peer of bubble.linkedTaskIds ?? []) {
      if (peer === bubble.id || !byId.get(peer)?.linkedTaskIds?.includes(bubble.id)) continue;
      if (!adjacency.get(bubble.id)!.includes(peer)) adjacency.get(bubble.id)!.push(peer);
    }
  }
  const visited = new Set<string>();
  const groups: LinkedBubbleGroup[] = [];
  for (const bubble of bubbles) {
    if (visited.has(bubble.id)) continue;
    const queue = [bubble.id];
    visited.add(bubble.id);
    for (const id of queue) {
      for (const peer of adjacency.get(id) ?? []) {
        if (visited.has(peer)) continue;
        visited.add(peer);
        queue.push(peer);
      }
    }
    const ids = [...queue].sort();
    const votes = new Map<string, number>();
    for (const id of ids) {
      const preferred = byId.get(id)!.bubbleLinkAnchorId;
      if (preferred && ids.includes(preferred)) votes.set(preferred, (votes.get(preferred) ?? 0) + 1);
    }
    const anchorId = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
      ?? (ids.length === 1 ? ids[0] : [...ids].sort((a, b) => byId.get(b)!.radius - byId.get(a)!.radius || a.localeCompare(b))[0]);
    const edges: Array<[string, string]> = [];
    for (const id of ids) {
      for (const peer of adjacency.get(id) ?? []) {
        if (id < peer) edges.push([id, peer]);
      }
    }
    groups.push({ ids, anchorId, edges });
  }
  return groups;
}

/**
 * Deterministic, collision-free packing. Sector boundaries and circle exclusion
 * are hard constraints, never optional forces. Linked edges only affect which
 * circle is placed next and its preferred position, so a bond cannot displace
 * another task onto a neighbour or across a sector divider.
 */
export function linkedBubblePositions(bubbles: VisualBubble[], bounds: Bounds): Map<string, Point> {
  const original = new Map(bubbles.map((bubble) => [bubble.id, { x: bubble.x, y: bubble.y }]));
  if (!bubbles.some((bubble) => bubble.pinned || bubble.linkedTaskIds?.length) && !bounds.compact) return original;
  const byId = new Map(bubbles.map((bubble) => [bubble.id, bubble]));
  const components = getLinkedBubbleGroups(bubbles);
  const neighbours = new Map(bubbles.map((bubble) => [bubble.id, [] as string[]]));
  for (const component of components) {
    for (const [a, b] of component.edges) {
      if ((byId.get(a)?.sectorIndex ?? 0) !== (byId.get(b)?.sectorIndex ?? 0)) continue;
      neighbours.get(a)!.push(b);
      neighbours.get(b)!.push(a);
    }
  }
  const centre = bounds.ellipse
    ? { x: bounds.ellipse.cx, y: bounds.ellipse.cy }
    : { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  const halfX = bounds.ellipse?.rx ?? (bounds.maxX - bounds.minX) / 2;
  const halfY = bounds.ellipse?.ry ?? (bounds.maxY - bounds.minY) / 2;
  // The angular margin previously used here only approximated the curved wall
  // and could leave a bubble visibly crossing the centre junction. Cache the
  // actual SVG quadratic boundaries as short, sub-pixel-accurate polylines.
  // The heavy computation happens once per layout, never on pointer moves.
  const hillBoundarySamples = bounds.ellipse && bounds.hillSectors && bounds.hillSectors.length > 1
    ? bounds.hillSectors.map((_, index) => {
      const curve = hillBoundaryCurve(bounds.hillSectors!, index);
      return Array.from({ length: 17 }, (_, step) => {
        const t = step / 16;
        const x = 2 * t * (1 - t) * curve.control.x + t * t * curve.end.x;
        const y = 2 * t * (1 - t) * curve.control.y + t * t * curve.end.y;
        return { x: centre.x + x * halfX, y: centre.y + y * halfY };
      });
    })
    : null;
  const minDistanceSquaredToWall = (point: Point, wall: Point[]): number => {
    let closestSquared = Infinity;
    for (let index = 1; index < wall.length; index += 1) {
      const a = wall[index - 1];
      const b = wall[index];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy || 1;
      const projection = Math.max(0, Math.min(1,
        ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
      const gapX = point.x - a.x - projection * dx;
      const gapY = point.y - a.y - projection * dy;
      closestSquared = Math.min(closestSquared, gapX * gapX + gapY * gapY);
    }
    return closestSquared;
  };
  const sectorOf = (bubble: VisualBubble) => bubble.sectorIndex ?? 0;
  const coefficientOf = (bubble: VisualBubble) => Math.min(1, Math.max(0, bubble.coefficient ?? 0));
  // Relative rank, not a fixed coefficient cutoff: otherwise most sectors
  // end up with just one "important" task and there is no group to form.
  const coreIdsBySector = new Map<number, Set<string>>();
  if (bounds.sectors && bounds.sectors.length > 1) {
    const perSector = new Map<number, VisualBubble[]>();
    for (const bubble of bubbles) {
      const sector = sectorOf(bubble);
      const existing = perSector.get(sector) ?? [];
      existing.push(bubble);
      perSector.set(sector, existing);
    }
    for (const [sector, candidates] of perSector) {
      const ranked = [...candidates].sort((a, b) =>
        coefficientOf(b) - coefficientOf(a) || b.radius - a.radius || a.id.localeCompare(b.id));
      const count = Math.min(ranked.length, Math.max(2, Math.ceil(ranked.length * 0.32)));
      coreIdsBySector.set(sector, new Set(ranked.slice(0, count).map((bubble) => bubble.id)));
    }
  }
  const highPriority = (bubble: VisualBubble) => coreIdsBySector.get(sectorOf(bubble))?.has(bubble.id) ?? false;

  // Each sector gets its own radial priority layers. Coefficient determines
  // the order, while radius accounts for the space a larger ring needs at the
  // central junction. Do not alter saved pins or task sizes.
  const radialLayers = new Map<string, { target: number; rank: number }>();
  if (bounds.compact && bounds.hillSectors?.length) {
    const sectorBubbles = new Map<number, VisualBubble[]>();
    for (const bubble of bubbles) {
      const index = sectorOf(bubble);
      const items = sectorBubbles.get(index) ?? [];
      items.push(bubble);
      sectorBubbles.set(index, items);
    }
    for (const items of sectorBubbles.values()) {
      const ranked = [...items].sort((a, b) =>
        coefficientOf(b) - coefficientOf(a) || b.radius - a.radius || a.id.localeCompare(b.id));
      ranked.forEach((bubble, index) => {
        const rank = ranked.length <= 1 ? 0 : index / (ranked.length - 1);
        const ringClearance = (bubble.radius / Math.max(1, Math.min(halfX, halfY))) * 0.27;
        radialLayers.set(bubble.id, {
          target: Math.min(0.84, 0.27 + Math.pow(rank, 0.78) * 0.53 + ringClearance),
          rank
        });
      });
    }
  }
  const unit = (point: Point) => {
    const length = Math.hypot(point.x, point.y) || 1;
    return { x: point.x / length, y: point.y / length };
  };
  const regionNormals = (bubble: VisualBubble) => {
    const region = bounds.sectors?.[sectorOf(bubble)];
    if (bounds.hillSectors?.length || !region || bounds.sectors?.length === 1) return null;
    const start = unit(region.start);
    const end = unit(region.end);
    return [
      { x: -start.y, y: start.x },
      { x: end.y, y: -end.x }
    ];
  };
  const inside = (bubble: VisualBubble, candidate: Point) => {
    // Progress rings protrude beyond the filled circle. For curved regions
    // reserve a little extra space around the full outline, not just its hub.
    const margin = bubble.radius + (hillBoundarySamples ? 12 : 8);
    if (bounds.ellipse) {
      const { cx, cy, rx, ry } = bounds.ellipse;
      const safeRx = Math.max(1, rx - margin);
      const safeRy = Math.max(1, ry - margin);
      if (Math.hypot((candidate.x - cx) / safeRx, (candidate.y - cy) / safeRy) > 1.000001) return false;
    } else if (candidate.x < bounds.minX + margin || candidate.x > bounds.maxX - margin ||
               candidate.y < bounds.minY + margin || candidate.y > bounds.maxY - margin) return false;
    if (hillBoundarySamples && bounds.hillSectors && bounds.ellipse) {
      const dx = (candidate.x - bounds.ellipse.cx) / bounds.ellipse.rx;
      const dy = (candidate.y - bounds.ellipse.cy) / bounds.ellipse.ry;
      const ratio = Math.hypot(dx, dy);
      const index = sectorOf(bubble);
      if (hillSectorIndexAtAngle(Math.atan2(dy, dx), ratio, bounds.hillSectors) !== index) return false;
      // Distance to BOTH shared quadratic walls in the rendered ellipse,
      // not an angular approximation in the unstretched layout circle.
      // Twelve extra pixels account for progress rings and curve sampling.
      const previousWall = hillBoundarySamples[index];
      const nextWall = hillBoundarySamples[(index + 1) % hillBoundarySamples.length];
      const requiredSquared = margin * margin;
      if (minDistanceSquaredToWall(candidate, previousWall) < requiredSquared ||
          minDistanceSquaredToWall(candidate, nextWall) < requiredSquared) return false;
    } else {
      const normals = regionNormals(bubble);
      if (normals?.some((normal) =>
        (candidate.x - centre.x) * normal.x + (candidate.y - centre.y) * normal.y < margin + 1.5)) return false;
    }
    return true;
  };
  const separation = (bubble: VisualBubble, candidate: Point, placed: Map<string, Point>) => {
    for (const [id, point] of placed) {
      const other = byId.get(id)!;
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance < bubble.radius + other.radius + 13 - 0.01) return false;
    }
    return true;
  };

  // Place groups in descending size order and honour manual placements first.
  // Traversing each link component breadth-first keeps chains compact.
  const ordered: string[] = [];
  const visited = new Set<string>();
  const sortedComponents = components
    .map((component) => ({
      component,
      // High-coefficient groups are placed first, even if lower-ranked
      // groups contain a physically larger bubble. Manual pins still win.
      priority: Math.max(...component.ids.map((id) =>
        (highPriority(byId.get(id)!) ? 1000 : 0) +
        byId.get(id)!.radius + coefficientOf(byId.get(id)!) * 90)),
      pinned: component.ids.some((id) => byId.get(id)!.pinned)
    }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.priority - a.priority);
  for (const { component } of sortedComponents) {
    const ids = [...component.ids].sort((a, b) =>
      Number(Boolean(byId.get(b)!.pinned)) - Number(Boolean(byId.get(a)!.pinned)) ||
      (Number(highPriority(byId.get(b)!)) - Number(highPriority(byId.get(a)!))) * 1000 ||
      (byId.get(b)!.radius + coefficientOf(byId.get(b)!) * 90) -
        (byId.get(a)!.radius + coefficientOf(byId.get(a)!) * 90) || a.localeCompare(b));
    for (const root of ids) {
      if (visited.has(root)) continue;
      const queue = [root];
      visited.add(root);
      for (const id of queue) {
        ordered.push(id);
        const adjacent = [...(neighbours.get(id) ?? [])].sort((a, b) =>
          Number(Boolean(byId.get(b)!.pinned)) - Number(Boolean(byId.get(a)!.pinned)) ||
          (Number(highPriority(byId.get(b)!)) - Number(highPriority(byId.get(a)!))) * 1000 ||
      (byId.get(b)!.radius + coefficientOf(byId.get(b)!) * 90) -
        (byId.get(a)!.radius + coefficientOf(byId.get(a)!) * 90) || a.localeCompare(b));
        for (const neighbour of adjacent) {
          if (visited.has(neighbour)) continue;
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }
  }

  const positions = new Map<string, Point>();
  for (const id of ordered) {
    const bubble = byId.get(id)!;
    const preferred = original.get(id)!;
    const placedNeighbours = (neighbours.get(id) ?? [])
      .filter((peer) => positions.has(peer))
      .map((peer) => ({ bubble: byId.get(peer)!, point: positions.get(peer)! }));
    const hasLink = placedNeighbours.length > 0;
    const isPinned = Boolean(bubble.pinned);
    // The highly-ranked tasks in EACH sector form an inner compact nucleus.
    // This affects scoring, never the sector wall or collision constraints.
    const highPriorityPeers = highPriority(bubble)
      ? [...positions].map(([peerId, point]) => ({ peer: byId.get(peerId)!, point }))
          .filter(({ peer }) => sectorOf(peer) === sectorOf(bubble) && highPriority(peer) && !peer.pinned)
      : [];
    const normalCenterDistance = (p: Point) =>
      Math.hypot((p.x - centre.x) / halfX, (p.y - centre.y) / halfY);
    const score = (p: Point) => {
      const preferredDistance = Math.hypot(p.x - preferred.x, p.y - preferred.y);
      if (isPinned) return preferredDistance * 20 + normalCenterDistance(p) * 4;
      const radial = normalCenterDistance(p);
      const hill = bounds.hillSectors?.[sectorOf(bubble)];
      const layer = radialLayers.get(bubble.id);
      const centreWeight = bounds.compact ? (highPriority(bubble) ? 205 : 245) : 0;
      let result: number;
      if (hill && layer && bounds.compact) {
        // High coefficient -> inner layer; low coefficient -> outer layer.
        // Penalty is asymmetric: small tasks are discouraged from taking
        // scarce inner room, while prominent tasks resist being pushed out.
        const radialError = radial - layer.target;
        const radialWeight = 370 + (radialError < 0 ? layer.rank * 235 : (1 - layer.rank) * 155);
        const angle = Math.atan2((p.y - centre.y) / halfY, (p.x - centre.x) / halfX);
        const angularDelta = Math.atan2(Math.sin(angle - hill.midAngle), Math.cos(angle - hill.midAngle));
        result = Math.abs(radialError) * radialWeight
          + Math.abs(angularDelta) * (highPriority(bubble) ? 38 : 12)
          + preferredDistance * 0.10;
      } else {
        result = radial * centreWeight + preferredDistance * (bounds.compact ? 0.085 : 1);
      }
      if (highPriorityPeers.length) {
        // Make separation from the core expensive, while retaining hard
        // collision/sector tests in consider() below.
        const nearestPeerGap = Math.min(...highPriorityPeers.map(({ peer, point }) =>
          Math.max(0, Math.hypot(p.x - point.x, p.y - point.y) - bubble.radius - peer.radius - 13)));
        const meanX = highPriorityPeers.reduce((total, item) => total + item.point.x, 0) / highPriorityPeers.length;
        const meanY = highPriorityPeers.reduce((total, item) => total + item.point.y, 0) / highPriorityPeers.length;
        const averageRadius = highPriorityPeers.reduce((total, item) => total + item.peer.radius, 0) / highPriorityPeers.length;
        const centroidGap = Math.max(0, Math.hypot(p.x - meanX, p.y - meanY) - bubble.radius - averageRadius);
        result += nearestPeerGap * 7 + centroidGap * 1.1;
      }
      if (hasLink) {
        // Keep every real adjacent task at a visible but short dotted gap.
        for (const neighbour of placedNeighbours) {
          const distance = Math.hypot(p.x - neighbour.point.x, p.y - neighbour.point.y);
          const ideal = bubble.radius + neighbour.bubble.radius + LINK_GAP;
          result += Math.abs(distance - ideal) * 2.6;
        }
      }
      return result;
    };
    let best: Point | null = null;
    let bestScore = Infinity;
    let safeFallback: Point | null = null;
    let safeFallbackDistance = Infinity;
    const consider = (p: Point) => {
      if (!inside(bubble, p)) return;
      // Crowded sectors may not admit a collision-free solution. Never fall
      // back to an unvalidated saved coordinate that crosses into a neighbour.
      const fallbackDistance = Math.hypot(p.x - preferred.x, p.y - preferred.y);
      if (fallbackDistance < safeFallbackDistance) {
        safeFallbackDistance = fallbackDistance;
        safeFallback = p;
      }
      if (!separation(bubble, p, positions)) return;
      const cost = score(p);
      if (cost < bestScore - 0.00001) {
        bestScore = cost;
        best = p;
      }
    };
    // In non-compact tests/legacy callers, keep untouched positions exactly.
    if (!bounds.compact && !hasLink && inside(bubble, preferred) && separation(bubble, preferred, positions)) {
      positions.set(id, { ...preferred });
      continue;
    }
    consider(preferred);

    // Exact tangent candidates ensure a few pixels of breathing room and
    // prevent large empty holes between otherwise adjacent bubbles.
    const nearby = [...positions].sort((a, b) =>
      (highPriority(bubble)
        ? Number(highPriority(byId.get(b[0])!)) - Number(highPriority(byId.get(a[0])!))
        : 0) ||
      Math.hypot(a[1].x - preferred.x, a[1].y - preferred.y) -
      Math.hypot(b[1].x - preferred.x, b[1].y - preferred.y));
    for (const [otherId, p] of nearby.slice(0, 100)) {
      const other = byId.get(otherId)!;
      const radial = bubble.radius + other.radius + (neighbours.get(id)?.includes(otherId) ? LINK_GAP : 13.5);
      const direction = Math.atan2(preferred.y - p.y, preferred.x - p.x);
      for (let step = 0; step < 32; step++) {
        const angle = direction + step * Math.PI / 16;
        consider({ x: p.x + radial * Math.cos(angle), y: p.y + radial * Math.sin(angle) });
      }
    }

    // Complete angular sweep inside the oval/sector if no tangent fits or
    // a more central vacancy is available. Large tasks are placed first.
    const angleStep = Math.PI / 32;
    const radialStep = Math.max(9, Math.min(21, bubble.radius * 0.42));
    for (let distance = 0; distance < Math.max(halfX, halfY); distance += radialStep) {
      const rx = distance;
      for (let a = 0; a < 64; a++) {
        const angle = a * angleStep;
        consider({
          x: centre.x + rx * Math.cos(angle) * halfX / Math.max(1, halfY),
          y: centre.y + rx * Math.sin(angle)
        });
      }
      // Any candidate with a cost well below the next ring's minimum radial
      // penalty cannot be improved by examining the outer rings.
      if (best && bounds.compact && !hasLink) {
        if (bounds.hillSectors?.length) {
          // Beyond this bubble's ideal priority layer, every later ring
          // incurs at least this radial penalty. Preserve the fast exit.
          const layer = radialLayers.get(bubble.id);
          const remainingLowerBound = Math.max(0, distance / halfY - (layer?.target ?? 0.52)) * 370;
          if (bestScore < remainingLowerBound - 4) break;
        } else if (bestScore < distance / halfY *
          (highPriority(bubble) ? 205 : 245) - 4) break;
      }
    }

    if (!best) {
      // Extremely crowded/physically infeasible inputs should remain finite.
      // Search a finer spiral before conceding any overlap.
      for (let distance = 0; distance < Math.max(halfX, halfY) && !best; distance += 5) {
        for (let a = 0; a < 128; a++) {
          const angle = a * Math.PI / 64;
          consider({ x: centre.x + distance * Math.cos(angle) * halfX / Math.max(1, halfY),
            y: centre.y + distance * Math.sin(angle) });
        }
      }
    }
    // In extremely crowded layouts prefer a geometrically valid centre even
    // if circles must be close; never escape the sector simply because packing
    // failed to find non-overlapping space.
    positions.set(id, best ?? safeFallback ?? { ...preferred });
  }
  return positions;
}

/** Dotted connector endpoints sit almost at the visible circle rims. */
export function bubbleLinkSegment(a: Point, b: Point, radiusA: number, radiusB: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const unitX = length > 0.001 ? dx / length : 1;
  const unitY = length > 0.001 ? dy / length : 0;
  const inset = 2;
  const start = Math.min(radiusA - inset, length / 2);
  const end = Math.min(radiusB - inset, length / 2);
  return {
    x1: a.x + unitX * start,
    y1: a.y + unitY * start,
    x2: b.x - unitX * end,
    y2: b.y - unitY * end
  };
}

export function detectBubbleDrop(
  center: Point,
  sourceId: string,
  sourceRadius: number,
  bubbles: VisualBubble[]
): DropIntent | null {
  let nearest: { targetId: string; distance: number; radius: number } | null = null;
  for (const bubble of bubbles) {
    if (bubble.id === sourceId) continue;
    const distance = Math.hypot(center.x - bubble.x, center.y - bubble.y);
    // Both full radii matter. Clamping the dragged radius to 48px meant
    // large-to-large links were not detected until the circles overlapped,
    // making their connecting preview effectively invisible.
    if (distance > bubble.radius + sourceRadius + 22) continue;
    if (!nearest || distance < nearest.distance) nearest = { targetId: bubble.id, distance, radius: bubble.radius };
  }
  if (!nearest) return null;
  return {
    targetId: nearest.targetId,
    kind: nearest.distance < nearest.radius * 0.55 ? 'nest' : 'link'
  };
}
