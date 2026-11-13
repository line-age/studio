import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

const widths = {
  code: "w-16",
  sections: "w-16 text-right tabular-nums",
  bar: "w-24",
  attribute: "w-30",
  /** "4/6 done", "2/3 cited", "2,324 sections": fixed so the column lines up. */
  progress: "w-24 justify-end tabular-nums",
} as const

/**
 * One cell of the list when it is wide enough to be a table. The same
 * component makes the column heads, so heads and cells line up.
 */
export function ListCell({
  column,
  children,
  className,
}: {
  column: keyof typeof widths
  children?: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center truncate type-ui-xs text-muted-foreground",
        (column === "sections" || column === "progress") && "justify-end",
        widths[column],
        className
      )}
    >
      {children}
    </span>
  )
}
