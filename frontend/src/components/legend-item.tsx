import type { ReactNode } from "react"

import { LineKey, type LineKind } from "@/components/line-key"
import { cn } from "@/lib/utils"

/** A line key with its meaning in words. */
export function LegendItem({
  kind,
  children,
  className,
}: {
  kind: LineKind
  children: ReactNode
  className?: string
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 type-ui-xs text-muted-foreground",
        className
      )}
    >
      <LineKey kind={kind} />
      {children}
    </li>
  )
}
