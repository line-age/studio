import { useState, type ReactNode } from "react"

import { ResizeHandle } from "@/components/resize-handle"
import { cn } from "@/lib/utils"

/**
 * A side panel of the Studio screen. It opens at its token width, slides
 * open and shut, and the person can drag its inner edge to make it wider (up
 * to two fifths of the window). The chosen width is kept in this browser.
 */
export function SidePanel({
  side,
  open,
  label,
  storageKey,
  widthToken,
  className,
  children,
}: {
  side: "left" | "right"
  open: boolean
  label: string
  storageKey: string
  /** The CSS variable that holds the panel's own width. */
  widthToken: string
  className?: string
  children?: ReactNode
}) {
  const [min] = useState(
    () =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(widthToken)
      ) || 0
  )
  const [stored, setStored] = useState<number | null>(() => {
    try {
      const value = Number(localStorage.getItem(storageKey))
      return value > min ? value : null
    } catch {
      return null
    }
  })
  const [dragging, setDragging] = useState(false)

  const max = Math.max(min, window.innerWidth * 0.4)
  const width = Math.min(stored ?? min, max)
  const setWidth = (next: number | null) => {
    const value = next !== null && next > min ? next : null
    setStored(value)
    try {
      if (value === null) localStorage.removeItem(storageKey)
      else localStorage.setItem(storageKey, String(value))
    } catch {
      // Storage can be blocked; the width then lasts for this visit only.
    }
  }

  return (
    <aside
      aria-label={label}
      aria-hidden={!open}
      inert={!open}
      style={{ width: open ? width : 0 }}
      className={cn(
        "relative shrink-0 overflow-hidden",
        // No transition while dragging: the edge must follow the pointer.
        !dragging &&
          "transition-[width] duration-200 ease-out motion-reduce:transition-none"
      )}
    >
      {/* Fixed width and pinned to the outer edge, so it slides, not squashes. */}
      <div
        style={{ width }}
        className={cn(
          "absolute inset-y-0 flex flex-col",
          side === "left" ? "right-0 border-r" : "left-0 border-l",
          className
        )}
      >
        {children}
      </div>
      <ResizeHandle
        edge={side === "left" ? "right" : "left"}
        label={`${label} width`}
        width={width}
        min={min}
        max={max}
        onResize={setWidth}
        onReset={() => setWidth(null)}
        onDraggingChange={setDragging}
      />
    </aside>
  )
}
