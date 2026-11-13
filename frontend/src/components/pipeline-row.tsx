import type { ComponentProps, ReactNode } from "react"

import { CheckMark } from "@/components/check-mark"
import { Icon } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/**
 * One row of the left list: a pipeline, a group of sections that are in no
 * pipeline, or one section. A flush one-line row with a divider. After the
 * name come whatever cells the list has room for (`cells`, a row of
 * ListCells), then how far the work has come and the status in words.
 */
export function PipelineRow({
  name,
  cells,
  progress,
  status,
  selected = false,
  checked = selected ? "checked" : "unchecked",
  onCheck,
  checkLabel,
  expanded,
  onToggle,
  toggleLabel,
  indent = false,
  className,
  ...props
}: {
  name: ReactNode
  /** The columns between the name and the progress, as ListCells. */
  cells?: ReactNode
  /** "4/6": sections done, or required attributes cited. */
  progress: ReactNode
  /** A StatusBadge. */
  status: ReactNode
  selected?: boolean
  /** How much of the row's sections is selected. Defaults to `selected`. */
  checked?: "unchecked" | "checked" | "indeterminate"
  /** Makes the box a real checkbox that adds or removes this row. */
  onCheck?: () => void
  /** Accessible name of the box, needed with `onCheck`. */
  checkLabel?: string
  /** With `onToggle`: whether the rows under this one are showing. */
  expanded?: boolean
  /** Adds a chevron that shows or hides the rows under this one. */
  onToggle?: () => void
  /** Accessible name of the chevron, needed with `onToggle`. */
  toggleLabel?: string
  /** A row under another: set in from the left. */
  indent?: boolean
} & Omit<ComponentProps<"div">, "children">) {
  return (
    <div
      data-selected={selected || undefined}
      className={cn(
        "flex h-8 cursor-default items-center gap-1.5 border-b border-border-subtle pr-3 transition-colors duration-100 select-none [contain-intrinsic-size:auto_32px] [content-visibility:auto] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid",
        indent ? "pl-9" : "pl-3",
        selected
          ? "bg-selected hover:bg-selected-hover"
          : "hover:bg-muted active:bg-accent",
        className
      )}
      {...props}
    >
      <CheckMark value={checked} label={checkLabel} onChange={onCheck} />
      {onToggle && (
        <button
          type="button"
          aria-label={toggleLabel}
          aria-expanded={expanded}
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
          className="-mx-1 flex size-5 shrink-0 cursor-default items-center justify-center rounded-sm text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid"
        >
          <Icon
            name="chevron-right"
            className={cn(
              "size-3.5 transition-transform duration-100",
              expanded && "rotate-90"
            )}
          />
        </button>
      )}
      <span
        // A name cut short can still be read in full.
        title={typeof name === "string" ? name : undefined}
        className={cn(
          "min-w-0 flex-1 truncate",
          indent ? "type-ui-sm" : "type-ui-sm-medium"
        )}
      >
        {name}
      </span>
      {cells}
      <span className="shrink-0 text-right type-ui-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {progress}
      </span>
      <span className="flex w-21 shrink-0 justify-end">{status}</span>
    </div>
  )
}
