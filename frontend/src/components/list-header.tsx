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
  sortLabel,
  onSort,
  onSelectionChange,
  selectionLabel,
  className,
}: {
  label: ReactNode
  trailing?: ReactNode
  /** How much of the list is selected: none, some or all. */
  selection?: "unchecked" | "checked" | "indeterminate"
  /** Makes the box a working "select all". Needs `selectionLabel`. */
  onSelectionChange?: () => void
  selectionLabel?: string
  /** Show the sort arrow after the label: true or "ascending" points down. */
  sorted?: boolean | "ascending" | "descending"
  /** Makes the label a button that changes the order. Needs `sortLabel`. */
  onSort?: () => void
  sortLabel?: string
  className?: string
}) {
  const Label = onSort ? "button" : "span"
  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center gap-2 border-b border-border-subtle px-3 type-ui-xs-medium text-muted-foreground",
        className
      )}
    >
      <CheckMark
        value={selection}
        label={selectionLabel}
        onChange={onSelectionChange}
        tabIndex={0}
      />
      <span className="flex min-w-0 flex-1">
        <Label
          {...(onSort && {
            type: "button",
            "aria-label": sortLabel,
            onClick: onSort,
          })}
          className={cn(
            "flex min-w-0 items-center gap-0.5",
            onSort &&
              "-mx-1 cursor-default rounded-sm px-1 transition-colors duration-100 hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid"
          )}
        >
          <span className="truncate">{label}</span>
          {sorted && (
            <Icon
              name="chevron-down"
              className={cn("size-3", sorted === "descending" && "rotate-180")}
            />
          )}
        </Label>
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </div>
  )
}
