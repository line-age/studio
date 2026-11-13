/*
 * Where the tour draws: the ring around an area, and the card beside it.
 * Plain arithmetic on rectangles, so it can be tested without a layout.
 */

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/** How far the ring stands off the area, and the least it keeps from the window's edge. */
const RING_OFFSET = 4
/** Between the ring and the card. */
const CARD_GAP = 12
/** The least the card keeps from the window's edge. */
const CARD_MARGIN = 16

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max))

/** The ring: the area, a little wider, kept inside the window. */
export function ringBox(target: Box, viewport: Size): Box {
  const left = Math.max(target.left - RING_OFFSET, RING_OFFSET)
  const top = Math.max(target.top - RING_OFFSET, RING_OFFSET)
  const right = Math.min(
    target.left + target.width + RING_OFFSET,
    viewport.width - RING_OFFSET
  )
  const bottom = Math.min(
    target.top + target.height + RING_OFFSET,
    viewport.height - RING_OFFSET
  )
  return {
    left,
    top,
    width: Math.max(right - left, 0),
    height: Math.max(bottom - top, 0),
  }
}

/**
 * The card's top left corner. Beside the ring where there is room: right,
 * left, below, above, in that order. Inside it when the area leaves no room
 * on any side. With no ring, the middle of the window.
 */
export function cardPosition(
  ring: Box | null,
  card: Size,
  viewport: Size
): { left: number; top: number } {
  const maxLeft = viewport.width - card.width - CARD_MARGIN
  const maxTop = viewport.height - card.height - CARD_MARGIN
  if (!ring) {
    return {
      left: Math.max((viewport.width - card.width) / 2, CARD_MARGIN),
      top: Math.max((viewport.height - card.height) / 2, CARD_MARGIN),
    }
  }
  const beside = { top: clamp(ring.top, CARD_MARGIN, maxTop) }
  const along = { left: clamp(ring.left, CARD_MARGIN, maxLeft) }

  const right = ring.left + ring.width + CARD_GAP
  if (right <= maxLeft) return { left: right, ...beside }
  const left = ring.left - CARD_GAP - card.width
  if (left >= CARD_MARGIN) return { left, ...beside }
  const below = ring.top + ring.height + CARD_GAP
  if (below <= maxTop) return { ...along, top: below }
  const above = ring.top - CARD_GAP - card.height
  if (above >= CARD_MARGIN) return { ...along, top: above }
  return {
    left: clamp(ring.left + CARD_MARGIN, CARD_MARGIN, maxLeft),
    top: clamp(ring.top + CARD_MARGIN, CARD_MARGIN, maxTop),
  }
}
