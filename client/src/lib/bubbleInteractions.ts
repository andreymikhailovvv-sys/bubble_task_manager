export type VisualBubble = {
  id: string;
  x: number;
  y: number;
  radius: number;
  linkedTaskIds?: string[];
  bubbleLinkAnchorId?: string | null;
  /** A manually saved location resists displacement by other bubbles. */
  pinned?: boolean;
};

export type DropIntent = { targetId: string; kind: 'link' | 'nest' };
export type Point = { x: number; y: number };
export type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  ellipse?: { cx: number; cy: number; rx: number; ry: number };
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
 * Magnetically pack linked components as compact rigid groups, then resolve
 * collisions between the groups. Never push one linked member away from the others.
 */
export function linkedBubblePositions(bubbles: VisualBubble[], bounds: Bounds): Map<string, Point> {
  const positions = new Map(bubbles.map((bubble) => [bubble.id, { x: bubble.x, y: bubble.y }]));
  if (!bubbles.some((bubble) => bubble.pinned || bubble.linkedTaskIds?.length)) return positions;
  const byId = new Map(bubbles.map((bubble) => [bubble.id, bubble]));
  const components = getLinkedBubbleGroups(bubbles);
  const groups = components.map((group) => {
    const pinned = group.ids.some((id) => Boolean(byId.get(id)?.pinned));
    // Use the largest visible circle as the cluster's physics centre.
    // A manually positioned circle wins over automatic size weighting,
    // preserving explicit user placement when a group is linked.
    const candidates = group.ids.filter((id) => !pinned || byId.get(id)?.pinned);
    const layoutRootId = [...candidates].sort((a, b) =>
      byId.get(b)!.radius - byId.get(a)!.radius || a.localeCompare(b))[0];
    return { ...group, pinned, layoutRootId };
  });

  // Every real edge should connect two nearby circles, even if the user
  // formed a chain rather than a star. Place a breadth-first spanning tree
  // around the original anchor, sampling angles until new circles fit.
  for (const group of groups) {
    if (group.ids.length < 2) continue;
    const anchor = byId.get(group.layoutRootId)!;
    // Large linked tasks pull their full cluster closer to the shared
    // intersection of the sector dividers. Never override a manual pin.
    if (bounds.ellipse && !group.pinned) {
      const { cx, cy, rx, ry } = bounds.ellipse;
      const radiusRatio = Math.min(1, anchor.radius / 145);
      const allowedRadius = 0.74 - radiusRatio * 0.50;
      const originalRadius = Math.hypot((anchor.x - cx) / rx, (anchor.y - cy) / ry);
      if (originalRadius > allowedRadius && originalRadius > 0.001) {
        const shrink = allowedRadius / originalRadius;
        positions.set(anchor.id, {
          x: cx + (anchor.x - cx) * shrink,
          y: cy + (anchor.y - cy) * shrink
        });
      }
    }
    const placed = new Set<string>([anchor.id]);
    const queue = [anchor.id];
    const adjacency = new Map(group.ids.map((id) => [id, [] as string[]]));
    for (const [a, b] of group.edges) {
      adjacency.get(a)!.push(b);
      adjacency.get(b)!.push(a);
    }
    for (const parentId of queue) {
      const parent = byId.get(parentId)!;
      const parentPoint = positions.get(parentId)!;
      const children = (adjacency.get(parentId) ?? []).filter((id) => !placed.has(id))
        .sort((a, b) => byId.get(b)!.radius - byId.get(a)!.radius || a.localeCompare(b));
      for (const id of children) {
        if (placed.has(id)) continue;
        const member = byId.get(id)!;
        const defaultAngle = Math.atan2(member.y - parent.y, member.x - parent.x);
        const anchorPoint = positions.get(anchor.id)!;
        const outwardAngle = Math.atan2(parentPoint.y - anchorPoint.y, parentPoint.x - anchorPoint.x);
        const baseAngle = parentId === anchor.id || Math.hypot(parentPoint.x - positions.get(anchor.id)!.x, parentPoint.y - positions.get(anchor.id)!.y) < 0.1
          ? (Math.hypot(member.x - parent.x, member.y - parent.y) > 0.1 ? defaultAngle : -Math.PI / 2)
          : outwardAngle;
        const minDistance = parent.radius + member.radius + LINK_GAP;
        let best: { x: number; y: number; score: number } | null = null;
        for (let step = 0; step < 12 && !best; step++) {
          const radius = minDistance + step * 5;
          for (let sector = 0; sector < 32; sector++) {
            const offset = sector <= 16 ? sector : sector - 32;
            const angle = baseAngle + offset * Math.PI / 16;
            const x = parentPoint.x + Math.cos(angle) * radius;
            const y = parentPoint.y + Math.sin(angle) * radius;
            const overlaps = [...placed].some((otherId) => {
              const other = positions.get(otherId)!;
              return Math.hypot(other.x - x, other.y - y) <
                member.radius + byId.get(otherId)!.radius + LINK_GAP - 0.1;
            });
            if (overlaps) continue;
            const spread = Math.hypot(x - anchorPoint.x, y - anchorPoint.y);
            const score = Math.abs(offset) * 4.5 + spread * 0.18 + step * 5;
            if (!best || score < best.score) best = { x, y, score };
          }
        }
        // A degenerate dense group should never leave an unplaced task.
        const destination = best ?? {
          x: parentPoint.x + minDistance,
          y: parentPoint.y,
          score: Infinity
        };
        positions.set(id, { x: destination.x, y: destination.y });
        placed.add(id);
        queue.push(id);
      }
    }
  }

  const translate = (group: { ids: string[] }, dx: number, dy: number) => {
    for (const id of group.ids) {
      const p = positions.get(id)!;
      p.x += dx;
      p.y += dy;
    }
  };
  const clampGroup = (group: { ids: string[] }) => {
    // Correct translation as a whole to maintain the shape and link length.
    for (let attempt = 0; attempt < 8; attempt++) {
      let adjusted = false;
      for (const id of group.ids) {
        const bubble = byId.get(id)!;
        const p = positions.get(id)!;
        const inset = bubble.radius + 6;
        let dx = 0, dy = 0;
        if (bounds.ellipse) {
          const { cx, cy } = bounds.ellipse;
          const rx = Math.max(1, bounds.ellipse.rx - inset);
          const ry = Math.max(1, bounds.ellipse.ry - inset);
          const ratio = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
          if (ratio > 1) {
            dx = cx + (p.x - cx) / ratio - p.x;
            dy = cy + (p.y - cy) / ratio - p.y;
          }
        } else {
          dx = Math.max(bounds.minX + inset, Math.min(bounds.maxX - inset, p.x)) - p.x;
          dy = Math.max(bounds.minY + inset, Math.min(bounds.maxY - inset, p.y)) - p.y;
        }
        if (dx || dy) {
          translate(group, dx, dy);
          adjusted = true;
        }
      }
      if (!adjusted) break;
    }
  };
  groups.forEach(clampGroup);

  // A circle trapped in the saddle between two members of a cluster will
  // otherwise oscillate between opposing forces. Move it sideways first.
  for (const group of groups) {
    if (group.ids.length < 2) continue;
    for (const intruder of groups) {
      if (intruder === group || intruder.ids.length !== 1) continue;
      const id = intruder.ids[0];
      const circle = byId.get(id)!;
      for (let pass = 0; pass < 5; pass++) {
        const p = positions.get(id)!;
        const neighbours = group.ids.filter((otherId) => {
          const other = positions.get(otherId)!;
          return Math.hypot(p.x - other.x, p.y - other.y) <
            circle.radius + byId.get(otherId)!.radius + BUBBLE_CLEARANCE;
        });
        if (neighbours.length < 2) break;
        const a = positions.get(neighbours[0])!;
        const b = positions.get(neighbours[1])!;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        const signed = (p.x - a.x) * nx + (p.y - a.y) * ny;
        const direction = signed > 0 ? 1 : signed < 0 ? -1 : id < group.anchorId ? -1 : 1;
        const needed = Math.max(byId.get(neighbours[0])!.radius, byId.get(neighbours[1])!.radius) + circle.radius + BUBBLE_CLEARANCE;
        translate(intruder, nx * direction * Math.max(0, needed - Math.abs(signed)), ny * direction * Math.max(0, needed - Math.abs(signed)));
        clampGroup(intruder);
      }
    }
  }

  // Relax the complete groups rather than independently moving linked circles.
  // A weak repulsion BEFORE contact distributes clusters into sparse areas;
  // hard collision resolution still handles real overlaps.
  const fieldCentre = bounds.ellipse
    ? { x: bounds.ellipse.cx, y: bounds.ellipse.cy } : null;
  for (let pass = 0; pass < 80; pass++) {
    let deepestOverlap = 0;
    if (fieldCentre) {
      const centroid = (group: typeof groups[number]) => {
        const root = positions.get(group.layoutRootId)!;
        const extent = Math.max(...group.ids.map((id) => {
          const point = positions.get(id)!;
          return Math.hypot(point.x - root.x, point.y - root.y) + byId.get(id)!.radius;
        }));
        return { x: root.x, y: root.y, extent };
      };
      for (let i = 0; i < groups.length; i++) {
        const aGroup = groups[i];
        const a = centroid(aGroup);
        for (let j = i + 1; j < groups.length; j++) {
          const bGroup = groups[j];
          const b = centroid(bGroup);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.hypot(dx, dy);
          const comfortDistance = (a.extent + b.extent) * 0.88 + 18;
          if (distance >= comfortDistance) continue;
          const angle = distance > 0.01 ? { x: dx / distance, y: dy / distance }
            : { x: (i + j) % 2 ? -1 : 1, y: 0 };
          const aWeight = aGroup.pinned ? 0.015 : 1;
          const bWeight = bGroup.pinned ? 0.015 : 1;
          const weightSum = aWeight + bWeight;
          const step = Math.min(3.6, (comfortDistance - distance) * 0.065);
          translate(aGroup, -angle.x * step * aWeight / weightSum,
            -angle.y * step * aWeight / weightSum);
          translate(bGroup, angle.x * step * bWeight / weightSum,
            angle.y * step * bWeight / weightSum);
        }
      }
      // Do not let the gentle spacing force push large cluster roots right
      // back to the periphery; size has priority over their satellite count.
      for (const group of groups) {
        if (group.pinned || group.ids.length < 2) continue;
        const root = positions.get(group.layoutRootId)!;
        const maxRadius = Math.min(1, byId.get(group.layoutRootId)!.radius / 145);
        const desiredFraction = 0.74 - maxRadius * 0.5;
        const dx = root.x - fieldCentre.x;
        const dy = root.y - fieldCentre.y;
        const ellipse = bounds.ellipse!;
        const fraction = Math.hypot(dx / ellipse.rx, dy / ellipse.ry);
        if (fraction > desiredFraction && fraction > 0.001) {
          const pull = Math.min(0.08, (fraction - desiredFraction) * 0.09);
          translate(group, -dx * pull, -dy * pull);
        }
      }
    }
    for (let i = 0; i < groups.length; i++) {
      const aGroup = groups[i];
      for (let j = i + 1; j < groups.length; j++) {
        const bGroup = groups[j];
        let deepest: { x: number; y: number; overlap: number } | null = null;
        for (const aId of aGroup.ids) for (const bId of bGroup.ids) {
          const a = positions.get(aId)!;
          const b = positions.get(bId)!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.hypot(dx, dy);
          const overlap = byId.get(aId)!.radius + byId.get(bId)!.radius + BUBBLE_CLEARANCE - distance;
          if (overlap <= 0 || (deepest && overlap <= deepest.overlap)) continue;
          // A consistent fallback is essential for two bubbles with exactly
          // equal coordinates, otherwise the solver never separates them.
          const seed = (i + j) % 2 ? 1 : -1;
          deepest = { x: distance > 0.0001 ? dx / distance : seed,
            y: distance > 0.0001 ? dy / distance : 0, overlap };
        }
        if (!deepest) continue;
        deepestOverlap = Math.max(deepestOverlap, deepest.overlap);
        const aWeight = aGroup.pinned ? 0.06 : 1;
        const bWeight = bGroup.pinned ? 0.06 : 1;
        const total = aWeight + bWeight;
        const step = deepest.overlap * 0.90;
        translate(aGroup, -deepest.x * step * aWeight / total, -deepest.y * step * aWeight / total);
        translate(bGroup, deepest.x * step * bWeight / total, deepest.y * step * bWeight / total);
      }
    }
    groups.forEach(clampGroup);
    if (deepestOverlap < 0.28) break;
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
    if (distance > bubble.radius + Math.min(sourceRadius, 48) + 18) continue;
    if (!nearest || distance < nearest.distance) nearest = { targetId: bubble.id, distance, radius: bubble.radius };
  }
  if (!nearest) return null;
  return {
    targetId: nearest.targetId,
    kind: nearest.distance < nearest.radius * 0.55 ? 'nest' : 'link'
  };
}
