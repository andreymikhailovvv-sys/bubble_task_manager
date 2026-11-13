/** Compact bubble hover card placement in screen pixels.
 * Use the real bubble bounds rather than cursor coordinates, so a small
 * viewport cannot force the card over the bubble it describes. */
export type BubbleHoverAnchor = { left: number; right: number; top: number; bottom: number; width: number; height: number };
export type BubbleHoverPlacement = { left: number; top: number; width: number; maxHeight: number };

export function compactBubbleHoverPlacement(
  rect: BubbleHoverAnchor, viewportWidth: number, viewportHeight: number
): BubbleHoverPlacement {
  const margin = 12;
  const gap = 16;
  const preferredWidth = 288;
  const preferredHeight = 315;
  const viewportCardHeight = Math.min(preferredHeight, Math.max(0, viewportHeight - 2 * margin));
  const rightSpace = viewportWidth - rect.right - gap - margin;
  const leftSpace = rect.left - gap - margin;
  if (Math.max(rightSpace, leftSpace) >= 190) {
    const right = rightSpace >= leftSpace;
    const width = Math.min(preferredWidth, right ? rightSpace : leftSpace);
    return {
      left: right ? rect.right + gap : rect.left - gap - width,
      top: Math.max(margin, Math.min((rect.top + rect.bottom - viewportCardHeight) / 2, viewportHeight - viewportCardHeight - margin)),
      width,
      maxHeight: viewportCardHeight
    };
  }
  // When both sides are narrow, display above/below instead of over the bubble.
  const belowSpace = viewportHeight - rect.bottom - gap - margin;
  const aboveSpace = rect.top - gap - margin;
  const below = belowSpace >= aboveSpace;
  const maxHeight = Math.min(preferredHeight, Math.max(0, below ? belowSpace : aboveSpace));
  const width = Math.min(preferredWidth, Math.max(0, viewportWidth - 2 * margin));
  return {
    left: Math.max(margin, Math.min(rect.left + rect.width / 2 - width / 2, viewportWidth - width - margin)),
    top: below ? rect.bottom + gap : rect.top - gap - maxHeight,
    width,
    maxHeight
  };
}
