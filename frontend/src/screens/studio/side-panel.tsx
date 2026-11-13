import { useMemo, useState, type ReactNode } from "react"

import { ResizeHandle } from "@/components/resize-handle"
import { cn } from "@/lib/utils"

import { PanelWidthContext } from "./panel-width-context"

const read = (key: string, min: number): number | null => {
  try {
    const value = Number(localStorage.getItem(key))
    return value > min ? value : null
  } catch {
    return null
  }
}

const write = (key: string, value: number | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, String(value))
  } catch {
    // Storage can be blocked; the width then lasts for this visit only.
  }
}

/**
 * A side panel of the Studio screen. It opens at its token width, slides
 * open and shut, and the person can drag its inner edge to make it wider, up
 * to `maxWidth` (two fifths of the window unless told). The chosen width is
 * kept in this browser under `storageKey`; a different key is a different
 * width, so two things that share the panel each keep their own.
 *
 * With `wideWidth`, a double click on the edge goes between the panel's own
 * width and the last wide one, and what is inside can do the same through
 * `usePanelWidth().toggleWide`.
 */
export function SidePanel({
  side,
  open,
  label,
  storageKey,
  widthToken,
  maxWidth,
  wideWidth,
  className,
  children,
}: {
  side: "left" | "right"
  open: boolean
  label: string
  storageKey: string
  /** The CSS variable that holds the panel's own width. */
  widthToken: string
  /** The widest the panel goes, in pixels. */
  maxWidth?: number
  /** The width "wide" means before the person has chosen one. */
  wideWidth?: number
  className?: string
  children?: ReactNode
}) {
  const [min] = useState(
    () =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(widthToken)
      ) || 0
  )
  // Widths chosen in this visit, by storage key; the browser has the rest.
  const [chosen, setChosen] = useState<Record<string, number | null>>({})
  const [dragging, setDragging] = useState(false)

  const stored =
    storageKey in chosen ? chosen[storageKey] : read(storageKey, min)
  const max = Math.max(min, maxWidth ?? window.innerWidth * 0.4)
  const width = Math.min(stored ?? min, max)
  const wideKey = `${storageKey}.wide`

  const value = useMemo(() => {
    const setWidth = (next: number | null) => {
      const kept = next !== null && next > min ? next : null
      setChosen((had) => ({ ...had, [storageKey]: kept }))
      write(storageKey, kept)
      // The last wide width is where "wide" returns to.
      if (kept !== null) write(wideKey, kept)
    }
    return {
      width,
      min,
      wide: width > min,
      setWidth,
      toggleWide: () => {
        if (width > min) setWidth(null)
        else setWidth(Math.min(read(wideKey, min) ?? wideWidth ?? max, max))
      },
    }
  }, [width, min, max, storageKey, wideKey, wideWidth])

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
        <PanelWidthContext value={value}>{children}</PanelWidthContext>
      </div>
      <ResizeHandle
        edge={side === "left" ? "right" : "left"}
        label={`${label} width`}
        width={width}
        min={min}
        max={max}
        onResize={value.setWidth}
        onReset={
          wideWidth === undefined
            ? () => value.setWidth(null)
            : value.toggleWide
        }
        onDraggingChange={setDragging}
      />
    </aside>
  )
}
