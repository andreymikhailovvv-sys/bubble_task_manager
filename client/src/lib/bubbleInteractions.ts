export type VisualBubble = {
  id: string;
  x: number;
  y: number;
  radius: number;
  linkedTaskIds?: string[];
};

export type DropIntent = { targetId: string; kind: 'link' | 'nest' };

// Pairs have a visible, stable magnet gap after a server refresh.
// The first ID is the anchor; there is no new relationship layout stored in the DB.
export function linkedBubblePositions(
  bubbles: VisualBubble[],
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
): Map<string, { x: number; y: number }> {
  const positions = new Map(bubbles.map((bubble) => [bubble.id, { x: bubble.x, y: bubble.y }]));
  const byId = new Map(bubbles.map((bubble) => [bubble.id, bubble]));
  for (const anchor of bubbles) {
    const partnerId = anchor.linkedTaskIds?.[0];
    if (!partnerId || anchor.id > partnerId) continue;
    const partner = byId.get(partnerId);
    if (!partner || partner.linkedTaskIds?.[0] !== anchor.id) continue;
    const distance = Math.hypot(partner.x - anchor.x, partner.y - anchor.y);
    const unitX = distance > 0.01 ? (partner.x - anchor.x) / distance : 1;
    const unitY = distance > 0.01 ? (partner.y - anchor.y) / distance : 0;
    const desired = anchor.radius + partner.radius + 12;
    positions.set(partner.id, {
      x: Math.max(bounds.minX + partner.radius, Math.min(bounds.maxX - partner.radius, anchor.x + unitX * desired)),
      y: Math.max(bounds.minY + partner.radius, Math.min(bounds.maxY - partner.radius, anchor.y + unitY * desired))
    });
  }
  return positions;
}

export function detectBubbleDrop(
  center: { x: number; y: number },
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
