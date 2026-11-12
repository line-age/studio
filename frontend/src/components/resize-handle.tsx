import { useRef, type KeyboardEvent, type PointerEvent } from "react"

import { cn } from "@/lib/utils"

/**
 * The draggable edge of a panel: its right edge, or its left with
 * `edge="left"`. Put it inside a `relative` panel; it sits just inside the edge.
 * Drag, or use the arrow keys; a double click or Home goes back to the
 * panel's own width. Not in Figma yet: the owner asked for it on 2026-11-12.
 */
export function ResizeHandle({
  label,
  width,
  min,
  max,
  onResize,
  onReset,
  onDraggingChange,
  edge = "right",
  className,
}: {
  label: string
  /** The panel's current width in pixels. */
  width: number
  min: number
  max: number
  onResize: (width: number) => void
  onReset: () => void
  onDraggingChange?: (dragging: boolean) => void
  /** Which edge of the panel the handle is on. */
  edge?: "left" | "right"
  className?: string
}) {
  const drag = useRef<{ x: number; width: number } | null>(null)
  const sign = edge === "right" ? 1 : -1
  const clamp = (value: number) =>
    Math.round(Math.min(max, Math.max(min, value)))

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, width }
    onDraggingChange?.(true)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    onResize(
      clamp(drag.current.width + sign * (event.clientX - drag.current.x))
    )
  }
  const onPointerUp = () => {
    if (drag.current) onDraggingChange?.(false)
    drag.current = null
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 64 : 16
    if (event.key === "ArrowRight") onResize(clamp(width + sign * step))
    else if (event.key === "ArrowLeft") onResize(clamp(width - sign * step))
    else if (event.key === "Home") onReset()
    else if (event.key === "End") onResize(clamp(max))
    else return
    event.preventDefault()
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={cn(
        "group absolute inset-y-0 z-10 flex w-1.5 cursor-col-resize touch-none outline-none",
        edge === "right" ? "right-0 justify-end" : "left-0 justify-start",
        className
      )}
    >
      <span className="w-0.5 bg-primary opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100" />
    </div>
  )
}
