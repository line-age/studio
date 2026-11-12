import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Foot of the left panel: map zoom on the left, map centre on the right. */
export function StatusBar({
  zoom,
  position,
  className,
}: {
  zoom: ReactNode
  position: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex h-9 shrink-0 items-center justify-between border-t bg-statusbar px-3",
        className
      )}
    >
      <span className="type-ui-mono-xs-medium">{zoom}</span>
      <span className="type-ui-mono-xs text-muted-foreground">{position}</span>
    </div>
  )
}
