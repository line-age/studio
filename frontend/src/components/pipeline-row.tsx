import type { ComponentProps, ReactNode } from "react"

import { CheckMark } from "@/components/check-mark"
import { Icon } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/**
 * One row of the left list: a pipeline, or a group of sections that are in
 * no pipeline. Its sections are listed in the right panel, not under it; a
 * pipeline opens, like a section on the right, to its own claims. A flush one-line row with a divider. After the
 * name come whatever cells the list has room for (`cells`, a row of
 * ListCells), then how far the work has come and the status in words.
 */
export function PipelineRow({
  name,
  cells,
  progress,
  status,
  statusWide = false,
  expanded,
  onToggle,
  selected = false,
  checked = selected ? "checked" : "unchecked",
  onCheck,
  checkLabel,
  className,
  ...props
}: {
  name: ReactNode
  /** The columns between the name and the progress, as ListCells. */
  cells?: ReactNode
  /** "4/6": sections done, or required attributes cited. */
  progress: ReactNode
  /** In the table, a StatusBadge after the split by status; else a proposed pipeline's badge, or nothing. */
  status?: ReactNode
  /** Room for the bar beside the badge. */
  statusWide?: boolean
  /** Open to its own claims; only a row that has claims of its own. */
  expanded?: boolean
  /** Opens or closes it. Without it, the row keeps the chevron's room. */
  onToggle?: () => void
  selected?: boolean
  /** How much of the row's sections is selected. Defaults to `selected`. */
  checked?: "unchecked" | "checked" | "indeterminate"
  /** Makes the box a real checkbox that adds or removes this row. */
  onCheck?: () => void
  /** Accessible name of the box, needed with `onCheck`. */
  checkLabel?: string
} & Omit<ComponentProps<"div">, "children">) {
  return (
    <div
      data-selected={selected || undefined}
      className={cn(
        "flex h-8 cursor-default items-center gap-1.5 border-b border-border-subtle pr-3 transition-colors duration-100 select-none [contain-intrinsic-size:auto_32px] [content-visibility:auto] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid",
        "pl-3",
        selected
          ? "bg-selected hover:bg-selected-hover"
          : "hover:bg-muted active:bg-accent",
        className
      )}
      {...props}
    >
      {onToggle ? (
        <span
          aria-hidden="true"
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
          className="-m-1 flex p-1 text-muted-foreground"
        >
          <Icon
            name={expanded ? "chevron-down" : "chevron-right"}
            className="size-3.5"
          />
        </span>
      ) : (
        <span aria-hidden="true" className="w-3.5 shrink-0" />
      )}
      <CheckMark value={checked} label={checkLabel} onChange={onCheck} />
      <span
        // A name cut short can still be read in full.
        title={typeof name === "string" ? name : undefined}
        className="min-w-0 flex-1 truncate type-ui-sm-medium"
      >
        {name}
      </span>
      {cells}
      <span className="shrink-0 text-right type-ui-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {progress}
      </span>
      {status != null && status !== false && (
        <span
          className={cn(
            "flex shrink-0 items-center justify-end",
            statusWide ? "w-52 gap-2.5 pl-3" : "w-21"
          )}
        >
          {status}
        </span>
      )}
    </div>
  )
}
