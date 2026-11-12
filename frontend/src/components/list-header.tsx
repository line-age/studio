import type { ReactNode } from "react"

import { CheckMark } from "@/components/check-mark"
import { Icon } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/** Column head above a list or tree. */
export function ListHeader({
  label,
  trailing,
  selection = "unchecked",
  sorted = false,
  className,
}: {
  label: ReactNode
  trailing?: ReactNode
  /** How much of the list is selected: none, some or all. */
  selection?: "unchecked" | "checked" | "indeterminate"
  /** Show the sort arrow after the label. */
  sorted?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center gap-2 border-b border-border-subtle px-3 type-ui-xs-medium text-muted-foreground",
        className
      )}
    >
      <CheckMark value={selection} />
      <span className="flex min-w-0 flex-1 items-center gap-0.5">
        <span className="truncate">{label}</span>
        {sorted && <Icon name="chevron-down" className="size-3" />}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </div>
  )
}
