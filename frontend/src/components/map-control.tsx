import { Children, Fragment, type ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Buttons floating over the map with the map-control shadow: one button, or
 * a vertical group with separators. Put ghost icon Buttons inside.
 */
export function MapControl({
  children,
  label,
  className,
}: {
  children: ReactNode
  /** Names the group for assistive technology: "Zoom". */
  label?: string
  className?: string
}) {
  const items = Children.toArray(children)
  return (
    <div
      role={items.length > 1 ? "group" : undefined}
      aria-label={label}
      className={cn(
        "flex flex-col items-center rounded-lg border bg-background p-px shadow-map-control",
        className
      )}
    >
      {items.map((child, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden="true" className="h-px w-8 bg-input" />}
          {child}
        </Fragment>
      ))}
    </div>
  )
}
