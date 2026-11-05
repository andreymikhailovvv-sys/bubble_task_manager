export type VisualBubble = {
  id: string;
  x: number;
  y: number;
  radius: number;
  linkedTaskIds?: string[];
  bubbleLinkAnchorId?: string | null;
  /** A user-dragged position takes priority over the automatic layout. */
  pinned?: boolean;
};

export type DropIntent = { targetId: string; kind: 'link' | 'nest' };

type Point = { x: number; y: number };
type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  ellipse?: { cx: number; cy: number; rx: number; ry: number };
};

type BubbleGroup = { ids: string[]; pinned: boolean };

// Resolve overlaps AFTER manual positions and magnetic pairs have been placed.
// Linked bubbles are one rigid group so a collision never separates the bond.
// Neither positions nor the original ranking algorithm are mutated or persisted here.
export function linkedBubblePositions(bubbles: VisualBubble[], bounds: Bounds): Map<string, Point> {
  const positions = new Map(bubbles.map((bubble) => [bubble.id, { x: bubble.x, y: bubble.y }]));
  if (!bubbles.some((bubble) => bubble.pinned || bubble.linkedTaskIds?.length)) return positions;

  const byId = new Map(bubbles.map((bubble) => [bubble.id, bubble]));
  const used = new Set<string>();
  const groups: BubbleGroup[] = [];
  for (const bubble of bubbles) {
    if (used.has(bubble.id)) continue;
    const partnerId = bubble.linkedTaskIds?.[0];
    const partner = partnerId ? byId.get(partnerId) : undefined;
    if (partner && partner.linkedTaskIds?.[0] === bubble.id && !used.has(partner.id)) {
      const anchorId = bubble.bubbleLinkAnchorId === partner.id || bubble.bubbleLinkAnchorId === bubble.id
        ? bubble.bubbleLinkAnchorId : partner.bubbleLinkAnchorId === bubble.id || partner.bubbleLinkAnchorId === partner.id
          ? partner.bubbleLinkAnchorId : (bubble.id < partner.id ? bubble.id : partner.id);
      const anchor = anchorId === bubble.id ? bubble : partner;
      const satellite = anchor === bubble ? partner : bubble;
      const vectorX = satellite.x - anchor.x;
      const vectorY = satellite.y - anchor.y;
      const length = Math.hypot(vectorX, vectorY);
      const distance = anchor.radius + satellite.radius + 12;
      positions.set(satellite.id, {
        x: anchor.x + (length > 0.001 ? vectorX / length : 1) * distance,
        y: anchor.y + (length > 0.001 ? vectorY / length : 0) * distance
      });
      groups.push({ ids: [anchor.id, satellite.id], pinned: Boolean(anchor.pinned || satellite.pinned) });
      used.add(anchor.id);
      used.add(satellite.id);
    } else {
      groups.push({ ids: [bubble.id], pinned: Boolean(bubble.pinned) });
      used.add(bubble.id);
    }
  }

  const translate = (group: BubbleGroup, dx: number, dy: number) => {
    for (const id of group.ids) {
      const point = positions.get(id)!;
      point.x += dx;
      point.y += dy;
    }
  };
  const clampGroup = (group: BubbleGroup) => {
    // Translate the complete group instead of independently clamping partners.
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const id of group.ids) {
        const point = positions.get(id)!;
        const bubble = byId.get(id)!;
        const inset = bubble.radius + 5;
        const ellipse = bounds.ellipse;
        if (ellipse) {
          const rx = Math.max(1, ellipse.rx - inset);
          const ry = Math.max(1, ellipse.ry - inset);
          const nx = (point.x - ellipse.cx) / rx;
          const ny = (point.y - ellipse.cy) / ry;
          const distance = Math.hypot(nx, ny);
          if (distance > 1) {
            translate(group, ellipse.cx + (point.x - ellipse.cx) / distance - point.x,
              ellipse.cy + (point.y - ellipse.cy) / distance - point.y);
            moved = true;
          }
        } else {
          const x = Math.max(bounds.minX + inset, Math.min(bounds.maxX - inset, point.x));
          const y = Math.max(bounds.minY + inset, Math.min(bounds.maxY - inset, point.y));
          if (x !== point.x || y !== point.y) {
            translate(group, x - point.x, y - point.y);
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
  };

  groups.forEach(clampGroup);
  // A third circle can become trapped between the two circles of a rigid
  // pair. In that case, horizontal repulsion oscillates forever. Eject the
  // intruder perpendicular to the bond before the ordinary relaxation.
  for (const bond of groups) {
    if (bond.ids.length !== 2) continue;
    const [firstId, secondId] = bond.ids;
    const first = positions.get(firstId)!;
    const second = positions.get(secondId)!;
    const segmentX = second.x - first.x;
    const segmentY = second.y - first.y;
    const length = Math.hypot(segmentX, segmentY);
    if (length < 0.001) continue;
    const normalX = -segmentY / length;
    const normalY = segmentX / length;
    for (const group of groups) {
      if (group === bond || group.ids.length !== 1) continue;
      const loneId = group.ids[0];
      const lone = positions.get(loneId)!;
      const radius = byId.get(loneId)!.radius;
      const firstRadius = byId.get(firstId)!.radius;
      const secondRadius = byId.get(secondId)!.radius;
      if (Math.hypot(lone.x - first.x, lone.y - first.y) >= firstRadius + radius + 7 ||
          Math.hypot(lone.x - second.x, lone.y - second.y) >= secondRadius + radius + 7) continue;
      const signedOffset = (lone.x - first.x) * normalX + (lone.y - first.y) * normalY;
      const neededOffset = Math.max(firstRadius, secondRadius) + radius + 9;
      const direction = signedOffset !== 0 ? Math.sign(signedOffset) : (loneId < firstId ? -1 : 1);
      const shift = Math.max(0, neededOffset - Math.abs(signedOffset));
      translate(group, normalX * direction * shift, normalY * direction * shift);
      clampGroup(group);
    }
  }
  // Only colliding groups move. Pinned/manual placements yield to each other
  // when there is no feasible alternative, but are much harder to displace.
  for (let pass = 0; pass < 72; pass++) {
    let largestOverlap = 0;
    for (let i = 0; i < groups.length; i++) {
      const aGroup = groups[i];
      for (let j = i + 1; j < groups.length; j++) {
        const bGroup = groups[j];
        let deepest: { dx: number; dy: number; overlap: number } | null = null;
        for (const aId of aGroup.ids) for (const bId of bGroup.ids) {
          const a = positions.get(aId)!;
          const b = positions.get(bId)!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.hypot(dx, dy);
          const safeDistance = byId.get(aId)!.radius + byId.get(bId)!.radius + 7;
          const overlap = safeDistance - distance;
          if (overlap <= 0 || (deepest && overlap <= deepest.overlap)) continue;
          const direction = distance > 0.0001 ? { x: dx / distance, y: dy / distance }
            : { x: (i + j) % 2 === 0 ? 1 : -1, y: 0 };
          deepest = { dx: direction.x, dy: direction.y, overlap };
        }
        if (!deepest) continue;
        largestOverlap = Math.max(largestOverlap, deepest.overlap);
        const aWeight = aGroup.pinned ? 0.07 : 1;
        const bWeight = bGroup.pinned ? 0.07 : 1;
        const total = aWeight + bWeight;
        const step = deepest.overlap * 0.85;
        translate(aGroup, -deepest.dx * step * aWeight / total, -deepest.dy * step * aWeight / total);
        translate(bGroup, deepest.dx * step * bWeight / total, deepest.dy * step * bWeight / total);
      }
    }
    groups.forEach(clampGroup);
    if (largestOverlap < 0.35) break;
  }
  return positions;
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
