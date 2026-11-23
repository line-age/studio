import { useEffect, useState, type CSSProperties, type RefObject } from "react"

/** How long the pointer rests on a section before its card shows. */
export const PEEK_DELAY = 150
/** How long the card takes to fade out; it stays mounted that long. */
export const PEEK_LEAVE = 100
/** The card's width, and the most room its height is given. */
const WIDTH = 280
const ROOM = 260
/** Between the pointer or the row and the card. */
const POINTER_GAP = 14
const ROW_GAP = 8

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Where the card goes, in the window's pixels. */
export type PeekAnchor =
  /** Beside the pointer, kept inside a box (the map). */
  | { kind: "pointer"; x: number; y: number; within: Box }
  /** Beside a row of a list on the right, on the map's side of it. */
  | { kind: "row"; rect: Pick<Box, "left" | "top" | "bottom"> }

/** The card being shown, and where it was put when it showed. */
export interface Peek {
  id: string
  anchor: PeekAnchor
  /** The pointer left: the card is fading out. */
  leaving: boolean
}

/**
 * Where the card sits. Beside the pointer it opens down and right, and
 * turns to the other side where it would leave the box. Beside a row it
 * opens to the left, level with the row, and hangs from the row's bottom
 * when the window ends below.
 */
export function placePeek(
  anchor: PeekAnchor,
  windowHeight: number
): CSSProperties {
  if (anchor.kind === "row") {
    const left = anchor.rect.left - ROW_GAP - WIDTH
    return anchor.rect.top + ROOM > windowHeight
      ? { left, bottom: windowHeight - anchor.rect.bottom }
      : { left, top: anchor.rect.top }
  }
  const { x, y, within } = anchor
  const left =
    x + POINTER_GAP + WIDTH > within.right
      ? Math.max(within.left, x - POINTER_GAP - WIDTH)
      : x + POINTER_GAP
  return y + POINTER_GAP + ROOM > within.bottom
    ? { left, bottom: windowHeight - (y - POINTER_GAP) }
    : { left, top: y + POINTER_GAP }
}

/**
 * Peek before selecting: the section the pointer has rested on for
 * `PEEK_DELAY`, until the pointer has been off it for `PEEK_LEAVE`. Moving
 * within one section keeps its card where it showed. `target` is null while
 * nothing is pointed at, or while a card must not show.
 */
export function usePeek(
  target: string | null,
  /** Where the pointer or the row is now; read when the card shows. */
  anchor: RefObject<PeekAnchor | null>
): Peek | null {
  const [shown, setShown] = useState<Omit<Peek, "leaving"> | null>(null)
  const shownId = shown?.id ?? null
  useEffect(() => {
    if (target === shownId) return
    const timer = setTimeout(
      () => {
        const at = anchor.current
        setShown(target && at ? { id: target, anchor: at } : null)
      },
      target ? PEEK_DELAY : PEEK_LEAVE
    )
    return () => clearTimeout(timer)
  }, [target, shownId, anchor])
  return shown ? { ...shown, leaving: shown.id !== target } : null
}
